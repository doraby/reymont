import 'package:flutter/material.dart';

/// Same tokens as the web app's CSS variables / the SwiftUI prototype's
/// Theme.swift, so this reads as the same product.
class ReymontColors {
  static const background = Color(0xFFF0EEE5);
  static const surface = Color(0xFFFAF9F4);
  static const surface2 = Color(0xFFE9E6DA);
  static const border = Color(0xFFDDD9C9);
  static const text = Color(0xFF3D3929);
  static const muted = Color(0xFF8A8778);
  static const accent = Color(0xFFC15F3C);
  static const accentSoft = Color(0xFFD97757);
}

/// The customizable highlight palette (mirrors HighlightColor.swift).
class HighlightPalette {
  static const amber = Color(0xFFE9C46A);
  static const terracotta = Color(0xFFD97757);
  static const sage = Color(0xFF8C9A6E);
  static const sky = Color(0xFF7FA6C4);
  static const lilac = Color(0xFFA88BC4);
  static const rose = Color(0xFFD98098);

  static const all = <String, Color>{
    'Amber': amber,
    'Terracotta': terracotta,
    'Sage': sage,
    'Sky': sky,
    'Lilac': lilac,
    'Rose': rose,
  };
}
