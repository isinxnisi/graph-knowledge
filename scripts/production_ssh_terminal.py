"""Interactive production SSH that also works beneath the Autopilot guard.

The guard starts a new session, which intentionally has no controlling
``/dev/tty``. Inherit its input/output descriptors and force the remote PTY
instead of trying to reopen a local controlling terminal.
"""
import shlex
import subprocess


def run_ssh_terminal(options, destination, command):
    return subprocess.run(['ssh', '-tt', *options, destination, command], check=True)


def check_ssh_terminal(options, destination):
    """Read a fixed non-secret probe through the same path; never invoke sudo."""
    program = (
        "import sys; "
        "assert sys.stdin.isatty(), 'Remote PTY missing'; "
        "print('R6_TERMINAL_PROBE_READY', flush=True); "
        "assert sys.stdin.readline().strip() == 'plunode-stdio-probe'; "
        "print('R6_TERMINAL_PROBE_OK', flush=True)"
    )
    return run_ssh_terminal(options, destination, 'python3 -u -c ' + shlex.quote(program))
