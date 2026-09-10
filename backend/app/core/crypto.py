"""Encryption at rest for data_source credentials.

MVP note: a real deployment should keep the key in a managed secrets store
(AWS/Azure/GCP KMS or similar) with per-workspace key separation. This module
is the minimum bar called out in the spec -- strong encryption at rest, never
plaintext -- with the key itself pulled from the environment.
"""
from cryptography.fernet import Fernet

from app.core.config import settings

_fernet = Fernet(settings.credentials_encryption_key.encode())


def encrypt_secret(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()
