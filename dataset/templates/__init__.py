"""Шаблоны жалоб.

important — медицинские инциденты (7 категорий × подкатегории, включая прямые
    сигналы о помощи sub_1_5).
not_important — шум: организационные вопросы, благодарности, false-positive
    медицина, тесты/приветствия, мусор/тарабарщина, разговоры не по теме.
"""

from .important import IMPORTANT_TUPLES
from .not_important import NOT_IMPORTANT_TUPLES

__all__ = ["IMPORTANT_TUPLES", "NOT_IMPORTANT_TUPLES"]
