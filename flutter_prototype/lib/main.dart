import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/gestures.dart';

import 'highlight.dart';
import 'sample_book.dart';
import 'theme.dart';

void main() {
  runApp(const ReymontProtoApp());
}

class ReymontProtoApp extends StatelessWidget {
  const ReymontProtoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Reymont · Flutter prototype',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        scaffoldBackgroundColor: ReymontColors.background,
        colorScheme: ColorScheme.fromSeed(
          seedColor: ReymontColors.accentSoft,
          brightness: Brightness.light,
        ),
        fontFamily: 'Lora',
        useMaterial3: true,
      ),
      home: const ReaderScreen(),
    );
  }
}

class ReaderScreen extends StatefulWidget {
  const ReaderScreen({super.key});

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  final Map<int, List<Highlight>> _highlights = {};
  _PendingSelection? _pending;

  String _pageText(int index) => kPages[index].join('\n\n');

  void _requestHighlight(int pageIndex, TextSelection selection) {
    if (selection.start == selection.end) return;
    setState(() {
      _pending = _PendingSelection(pageIndex: pageIndex, selection: selection);
    });
  }

  void _confirmHighlight(Color color) {
    final pending = _pending;
    if (pending == null) return;
    setState(() {
      final list = _highlights.putIfAbsent(pending.pageIndex, () => []);
      list.add(Highlight(
        pageIndex: pending.pageIndex,
        start: pending.selection.start,
        end: pending.selection.end,
        color: color,
      ));
      _pending = null;
    });
  }

  void _cancelPending() => setState(() => _pending = null);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ReymontColors.background,
      body: SafeArea(
        child: Column(
          children: [
            _TopBar(
              title: kChapterTitle,
              highlightCount: _highlights.values.fold(0, (a, b) => a + b.length),
            ),
            Expanded(
              child: Stack(
                children: [
                  PageView.builder(
                    controller: _pageController,
                    itemCount: kPages.length,
                    onPageChanged: (i) => setState(() => _currentPage = i),
                    itemBuilder: (context, index) {
                      return _BookPage(
                        pageIndex: index,
                        text: _pageText(index),
                        highlights: _highlights[index] ?? const [],
                        onRequestHighlight: (selection) => _requestHighlight(index, selection),
                        onTapHighlight: (h) => _showHighlightSheet(context, h),
                      );
                    },
                  ),
                  if (_pending != null)
                    _HighlightColorBar(
                      onPick: _confirmHighlight,
                      onCancel: _cancelPending,
                    ),
                ],
              ),
            ),
            _BottomBar(currentPage: _currentPage, pageCount: kPages.length),
          ],
        ),
      ),
    );
  }

  void _showHighlightSheet(BuildContext context, Highlight highlight) {
    showModalBottomSheet(
      context: context,
      backgroundColor: ReymontColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        final text = _pageText(highlight.pageIndex);
        final quote = text.substring(highlight.start, highlight.end);
        return Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                quote,
                style: TextStyle(
                  fontFamily: 'Lora',
                  fontStyle: FontStyle.italic,
                  fontSize: 16,
                  color: ReymontColors.text,
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'RECOLOR',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w600,
                  color: ReymontColors.accent,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: HighlightPalette.all.values.map((color) {
                  return Padding(
                    padding: const EdgeInsets.only(right: 14),
                    child: GestureDetector(
                      onTap: () {
                        setState(() => highlight.color = color);
                        Navigator.of(context).pop();
                      },
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _PendingSelection {
  final int pageIndex;
  final TextSelection selection;
  _PendingSelection({required this.pageIndex, required this.selection});
}

class _TopBar extends StatelessWidget {
  final String title;
  final int highlightCount;
  const _TopBar({required this.title, required this.highlightCount});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 50,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: ReymontColors.surface,
        border: Border(bottom: BorderSide(color: ReymontColors.border)),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(CupertinoIcons.chevron_down, size: 18),
            color: ReymontColors.muted,
            onPressed: () {},
          ),
          Expanded(
            child: Text(
              title,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontFamily: 'Lora',
                fontStyle: FontStyle.italic,
                color: ReymontColors.muted,
                fontSize: 14,
              ),
            ),
          ),
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconButton(
                icon: const Icon(CupertinoIcons.pencil_outline, size: 18),
                color: ReymontColors.muted,
                onPressed: () {},
              ),
              if (highlightCount > 0)
                Positioned(
                  right: 4,
                  top: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: ReymontColors.accentSoft,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '$highlightCount',
                      style: const TextStyle(fontSize: 10, color: Colors.white),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  final int currentPage;
  final int pageCount;
  const _BottomBar({required this.currentPage, required this.pageCount});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      decoration: BoxDecoration(
        color: ReymontColors.surface,
        border: Border(top: BorderSide(color: ReymontColors.border)),
      ),
      child: Row(
        children: [
          const Icon(CupertinoIcons.list_bullet, size: 16, color: ReymontColors.muted),
          Expanded(
            child: Center(
              child: Text(
                '$kBookTitle · Page ${currentPage + 1} of $pageCount',
                style: TextStyle(
                  fontFamily: 'Lora',
                  fontStyle: FontStyle.italic,
                  fontSize: 12.5,
                  color: ReymontColors.muted,
                ),
              ),
            ),
          ),
          const Text('A', style: TextStyle(fontSize: 13, color: ReymontColors.muted)),
          const SizedBox(width: 10),
          const Text('A', style: TextStyle(fontSize: 19, color: ReymontColors.muted)),
        ],
      ),
    );
  }
}

class _BookPage extends StatelessWidget {
  final int pageIndex;
  final String text;
  final List<Highlight> highlights;
  final ValueChanged<TextSelection> onRequestHighlight;
  final ValueChanged<Highlight> onTapHighlight;

  const _BookPage({
    required this.pageIndex,
    required this.text,
    required this.highlights,
    required this.onRequestHighlight,
    required this.onTapHighlight,
  });

  @override
  Widget build(BuildContext context) {
    final baseStyle = TextStyle(
                  fontFamily: 'Lora',
      fontSize: 17,
      height: 1.6,
      color: ReymontColors.text,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
      child: SelectableText.rich(
        TextSpan(children: _buildSpans(baseStyle)),
        onSelectionChanged: (selection, cause) {
          if (cause == SelectionChangedCause.longPress || cause == SelectionChangedCause.drag) {
            // handled by the "Highlight" action in the toolbar instead
          }
        },
        contextMenuBuilder: (context, editableTextState) {
          final selection = editableTextState.textEditingValue.selection;
          final buttonItems = List<ContextMenuButtonItem>.from(
            editableTextState.contextMenuButtonItems,
          );
          if (!selection.isCollapsed) {
            buttonItems.insert(
              0,
              ContextMenuButtonItem(
                label: 'Highlight',
                onPressed: () {
                  onRequestHighlight(selection);
                  editableTextState.hideToolbar();
                },
              ),
            );
          }
          return AdaptiveTextSelectionToolbar.buttonItems(
            anchors: editableTextState.contextMenuAnchors,
            buttonItems: buttonItems,
          );
        },
      ),
    );
  }

  List<TextSpan> _buildSpans(TextStyle baseStyle) {
    if (highlights.isEmpty) {
      return [TextSpan(text: text, style: baseStyle)];
    }
    final sorted = [...highlights]..sort((a, b) => a.start.compareTo(b.start));
    final spans = <TextSpan>[];
    var cursor = 0;
    for (final h in sorted) {
      final start = h.start.clamp(0, text.length);
      final end = h.end.clamp(0, text.length);
      if (start > cursor) {
        spans.add(TextSpan(text: text.substring(cursor, start), style: baseStyle));
      }
      spans.add(TextSpan(
        text: text.substring(start, end),
        style: baseStyle.copyWith(backgroundColor: h.color.withValues(alpha: 0.55)),
        // A fresh recognizer per build is fine for this prototype; production
        // code should keep recognizers around and dispose them explicitly.
        recognizer: TapGestureRecognizer()..onTap = () => onTapHighlight(h),
      ));
      cursor = end;
    }
    if (cursor < text.length) {
      spans.add(TextSpan(text: text.substring(cursor), style: baseStyle));
    }
    return spans;
  }
}

class _HighlightColorBar extends StatelessWidget {
  final ValueChanged<Color> onPick;
  final VoidCallback onCancel;
  const _HighlightColorBar({required this.onPick, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: GestureDetector(
        onTap: onCancel,
        child: Container(
          color: Colors.black.withValues(alpha: 0.15),
          padding: const EdgeInsets.only(top: 400),
          child: Align(
            alignment: Alignment.bottomCenter,
            child: GestureDetector(
              onTap: () {},
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(24, 18, 24, 30),
                decoration: const BoxDecoration(
                  color: ReymontColors.surface,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'CHOOSE A HIGHLIGHT COLOR',
                      style: TextStyle(
                        fontSize: 11,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                        color: ReymontColors.muted,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: HighlightPalette.all.values.map((color) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: GestureDetector(
                            onTap: () => onPick(color),
                            child: Container(
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
