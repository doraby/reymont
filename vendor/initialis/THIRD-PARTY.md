# Third-party notices

What this repository includes that others made, and the terms it comes under.

## Code

Bundled, minified, in `render/vendor/`:

- **opentype.js** (`opentype.min.js`): Copyright (c) 2020 Frederik De Bleser. MIT License.
- **gifenc** (`gifenc.esm.js`): Copyright (c) 2017 Matt DesLauriers. MIT License.
- **mp4-muxer** (`mp4-muxer.mjs`): Copyright (c) 2023 Vanilagy. MIT License.

The MIT License, for each of the three, with its copyright line above:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Hyphenation patterns

`render/data/hyph-en-us.pat.txt` and `hyph-en-us.hyp.txt` are the US English hyphenation patterns and exceptions from the hyph-utf8 package (https://www.hyphenation.org/tex), including the original patterns and exception list from Knuth's hyphen.tex.

> Copyright (C) 1990, 2004, 2005 Gerard D.C. Kuiken
>
> Copying and distribution of this file, with or without modification, are permitted in any medium without royalty provided the copyright notice and this notice are preserved.

## Fonts

Each face ships as the outlines of its capitals only, taken unchanged from the original font files. Every face, its designer and its licence are listed in [render/fonts/FONTS.md](render/fonts/FONTS.md); the SIL Open Font License is in `render/fonts/OFL.txt`. ET Book (`render/fonts/text/`) is by Dmitry Krasny, Bonnie Scranton and Edward Tufte, MIT.

## Texts

The passages set under an initial in In context (`data/passages.json`, a few for each letter, and `render/data/paragraphs.json`, one for each) are from public-domain editions of 31 books, by way of Project Gutenberg: A Portrait of the Artist as a Young Man, A Tale of Two Cities, Adventures of Huckleberry Finn, Alice's Adventures in Wonderland, Anna Karenina, Crime and Punishment, Don Quixote, Dubliners, Emma, Frankenstein; or, The modern Prometheus, Great Expectations, Jane Eyre: An Autobiography, Les Misérables, Leviathan, Middlemarch, Moby Dick; Or, The Whale, Pride and Prejudice, The Adventures of Tom Sawyer, Complete, The Awakening, and Selected Short Stories, The Count of Monte Cristo, The Great Gatsby, The Life and Adventures of Robinson Crusoe, The Odyssey, The Picture of Dorian Gray, The Prince, The Scarlet Letter, The life and opinions of Tristram Shandy, gentleman, The war of the worlds, Thus Spake Zarathustra: A Book for All and None, War and Peace, Wuthering Heights.

## Marks

The Claude mark on the share button is a trademark of Anthropic, used here to say a link can go to Claude, and the mark in the top right corner is GitHub's, redrawn by hand. Neither is covered by this project's licence. Both paths come from [Simple Icons](https://simple-icons.org).
