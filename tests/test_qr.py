"""QR codes made locally (cody/qr.py). Decoding with a real reader was checked with OpenCV for versions 2 to 10."""
import hashlib
import unittest

from cody import qr


class QrTest(unittest.TestCase):
    def test_reed_solomon_known_vector(self):
        data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]   # "HELLO WORLD", 1-M
        self.assertEqual(qr._ecc(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23])

    def test_sizes_and_finders(self):
        for text, size in (("hi", 21), ("https://pc.tail1234.ts.net/", 29), ("z" * 200, 57)):
            m = qr.matrix(text)
            self.assertEqual(len(m), size)
            for r0, c0 in ((0, 0), (0, size - 7), (size - 7, 0)):
                ring = [m[r0][c0 + i] for i in range(7)]
                self.assertEqual(ring, [True] * 7)
                self.assertEqual([m[r0 + 2][c0 + i] for i in range(7)], [True, False, True, True, True, False, True])

    def test_format_bits_read_back(self):
        m = qr.matrix("https://pc.tail1234.ts.net/")
        bits = [m[i][8] for i in range(6)] + [m[7][8], m[8][8], m[8][7]] + [m[8][14 - i] for i in range(9, 15)]
        value = sum(1 << i for i, b in enumerate(bits) if b) ^ 0x5412
        self.assertEqual(value >> 13, 0b00)                    # level M
        self.assertEqual(qr._bch(value >> 10, 0x537, 10), value)

    def test_same_output_as_the_one_checked_with_a_reader(self):
        rows = "".join("".join("1" if x else "0" for x in row) for row in qr.matrix("https://pc.tail1234.ts.net/"))
        self.assertEqual(hashlib.sha256(rows.encode()).hexdigest()[:16], "d3f439a4127f64c1")
        self.assertTrue(qr.svg("hi").startswith("<svg"))

    def test_too_long(self):
        with self.assertRaises(ValueError):
            qr.matrix("x" * 300)


if __name__ == "__main__":
    unittest.main()
