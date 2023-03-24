import itertools
from typing import Iterator, List, Literal, Tuple

from pydantic import BaseModel


class Atom(BaseModel):
    text: str
    start: float  # in ms
    end: float  # in ms
    conf: float  # confidence ~ logit probability


class Paragraph(BaseModel):
    type: Literal["paragraph"] = "paragraph"
    speaker: str
    children: List[Atom]
    lang: str

    def text(self) -> str:
        return "".join(a.text for a in self.children)

    def start(self) -> None | float:
        if len(self.children) > 0:
            return self.children[0].start

    def end(self) -> None | float:
        if len(self.children) > 0:
            return self.children[-1].end


class Document(BaseModel):
    paragraphs: List[Paragraph]

    def iter_lang_blocks(self) -> Iterator[Tuple[str, List[Atom]]]:
        atoms = []
        lang = None
        for paragraph in self.paragraphs:
            if lang is None:
                lang = paragraph.lang
                atoms = paragraph.children
                continue

            if paragraph.lang != lang:
                yield lang, atoms
                lang = paragraph.lang
                atoms = paragraph.children
            else:
                atoms += paragraph.children

        if lang is not None:
            yield lang, atoms

    def is_empty(self) -> bool:
        """Check whether the document contains at least one atom

        Note: The document might still have visible content. If you want to check for that, check
        that `document.text()` is not empty.

        Returns:
            bool: True if the document does not contain at least one atom
        """
        for paragraph in self.paragraphs:
            for atom in paragraph.children:
                return False
        return True

    def text(self) -> str:
        return "".join(p.text() for p in self.paragraphs)

    def start(self) -> None | float:
        if len(self.paragraphs) > 0:
            return self.paragraphs[0].start()

    def end(self) -> None | float:
        if len(self.paragraphs) > 0:
            return self.paragraphs[-1].end()

    def iter_atoms(self) -> Iterator[Atom]:
        return itertools.chain.from_iterable(p.children for p in self.paragraphs)


UNKNOWN_SPEAKER = "Speaker 1"
