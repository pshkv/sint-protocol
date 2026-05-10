"""SINT Protocol errors."""


class SintError(Exception):
    """Raised when the SINT gateway returns a 4xx or 5xx response."""

    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message
        super().__init__(f"[{status}] {code}: {message}")
