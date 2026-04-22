"""Шаблоны жалоб.

important — настоящие медицинские инциденты (164 шаблона, 7 категорий × 22 подкатегории).
not_important — шум, не-инциденты (расширенный набор: организационные, благодарности,
    false-positive медицина, тесты/приветствия, разговоры о погоде/семье, и т.п.).
"""

from .important import IMPORTANT_TUPLES
from .not_important import NOT_IMPORTANT_TUPLES

__all__ = ["IMPORTANT_TUPLES", "NOT_IMPORTANT_TUPLES"]
