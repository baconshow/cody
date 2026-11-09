"""Cody starting itself again (cody/restart.py): the same command line, a new process, after this one let go."""
import unittest
from unittest import mock

from cody import restart


class CommandTest(unittest.TestCase):
    def test_a_checkout_runs_python_with_the_same_arguments(self):
        cmd = restart.command(executable="/usr/bin/python3", argv=["/home/me/cody/cody.py", "--verbose"], is_frozen=False)
        self.assertEqual(cmd, ["/usr/bin/python3", "/home/me/cody/cody.py", "--verbose"])

    def test_the_installed_app_runs_its_own_exe_with_the_same_arguments(self):
        cmd = restart.command(executable=r"C:\Cody\cody-cli.exe", argv=[r"C:\Cody\cody-cli.exe", "--tray"], is_frozen=True)
        self.assertEqual(cmd, [r"C:\Cody\cody-cli.exe", "--tray"])


class RelaunchTest(unittest.TestCase):
    def test_on_windows_a_new_process_inherits_this_console(self):
        popen, exec_ = mock.Mock(), mock.Mock()
        restart.relaunch(["py", "cody.py"], popen=popen, exec_=exec_, platform="win32")
        popen.assert_called_once_with(["py", "cody.py"], close_fds=False)
        exec_.assert_not_called()

    def test_elsewhere_the_process_is_replaced(self):
        popen, exec_ = mock.Mock(), mock.Mock()
        restart.relaunch(["python3", "cody.py"], popen=popen, exec_=exec_, platform="linux")
        exec_.assert_called_once_with("python3", ["python3", "cody.py"])
        popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
