from cryptography.fernet import Fernet, InvalidToken

from app import config


class CryptoError(Exception):
    """Encryption is unavailable or the data cannot be decrypted. Message is safe to show."""


def _fernet() -> Fernet:
    key = config.TOKEN_ENCRYPTION_KEY
    if not key:
        raise CryptoError("TOKEN_ENCRYPTION_KEY is not set")
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError):
        raise CryptoError("TOKEN_ENCRYPTION_KEY is not a valid Fernet key") from None


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise CryptoError("Stored token could not be decrypted") from None
