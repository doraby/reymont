import 'package:flutter/material.dart';

/// A highlight anchored to one page's concatenated text (paragraphs joined
/// with a blank line) by plain character offsets — this prototype doesn't
/// need EPUB CFI or persistence, just enough to prove the interaction.
class Highlight {
  final int pageIndex;
  final int start;
  final int end;
  Color color;

  Highlight({
    required this.pageIndex,
    required this.start,
    required this.end,
    required this.color,
  });
}
