"""The computer's side of the Android app (cody/android.py): asset links, hello, the pair link."""
import unittest

from cody import __version__, android, config

PRINT = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"


class FingerprintTest(unittest.TestCase):
    def test_only_real_fingerprints_get_through(self):
        self.assertEqual(android.clean_fingerprints([PRINT.lower(), " " + PRINT + " ", PRINT, "nope", 3, "AA:BB"]), [PRINT])
        self.assertEqual(android.clean_fingerprints("not a list"), [])
        self.assertEqual(android.clean_fingerprints([PRINT + ":00", PRINT[:-3]]), [], "exactly 32 bytes")

    def test_config_keeps_them(self):
        self.assertEqual(config.load_config(path=__file__)["android_fingerprints"], [])   # not JSON: the defaults


class AssetLinksTest(unittest.TestCase):
    def test_empty_until_a_certificate_is_known(self):
        self.assertEqual(android.asset_links({"android_fingerprints": []}), [])

    def test_names_the_app_and_its_certificates(self):
        links = android.asset_links({"android_fingerprints": [PRINT]})
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["relation"], ["delegate_permission/common.handle_all_urls"])
        self.assertEqual(links[0]["target"]["namespace"], "android_app")
        self.assertEqual(links[0]["target"]["package_name"], "io.github.baconshow.cody")
        self.assertEqual(links[0]["target"]["sha256_cert_fingerprints"], list(android.RELEASE_FINGERPRINTS) + [PRINT])


class HelloAndLinkTest(unittest.TestCase):
    def test_hello_carries_the_token_and_the_language(self):
        self.assertEqual(android.hello("tok", {"language": "pt-BR"}),
                         {"app": "cody", "version": __version__, "token": "tok", "language": "pt-BR"})

    def test_pair_link(self):
        self.assertEqual(android.pair_link("https://my-pc.tailnet.ts.net/"),
                         "cody://pair?url=https%3A%2F%2Fmy-pc.tailnet.ts.net%2F")


if __name__ == "__main__":
    unittest.main()
