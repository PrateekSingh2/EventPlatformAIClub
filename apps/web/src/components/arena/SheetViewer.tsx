'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SheetData } from '@/lib/types';
import { Search, FileSpreadsheet, ArrowUp, ArrowDown } from 'lucide-react';
import { FileExtensionIcon } from './FileIcon';

interface SheetViewerProps {
  sheets: SheetData[];
  filename: string;
}

const ROW_H = 28;
const COL_W = 140;
const ROWNUM_W = 56;
const MIN_SPREADSHEET_COLS = 26; // Columns A to Z
const MIN_SPREADSHEET_ROWS = 100; // Rows 1 to 100

type SortState = { col: number; dir: 'asc' | 'desc' } | null;
type ActiveCell = { row: number; col: number } | null; // row = visual row index

// 0 -> 'A', 25 -> 'Z', 26 -> 'AA'
function getColumnLabel(index: number): string {
  let label = '';
  let num = index;
  while (num >= 0) {
    label = String.fromCharCode((num % 26) + 65) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

function compareCells(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number' && (b === '' || b === null || b === undefined)) return 1;
  if (typeof b === 'number' && (a === '' || a === null || a === undefined)) return -1;
  const aStr = String(a);
  const bStr = String(b);
  const an = Number(aStr);
  const bn = Number(bStr);
  if (aStr.trim() !== '' && bStr.trim() !== '' && !Number.isNaN(an) && !Number.isNaN(bn)) {
    return an - bn;
  }
  return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
}

export function SheetViewer({ sheets, filename }: SheetViewerProps) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [active, setActive] = useState<ActiveCell>(null);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const resizingColRef = useRef<{ colIdx: number; startX: number; startWidth: number } | null>(null);
  const columnResizeListenersRef = useRef<{
    move: (moveEvent: MouseEvent) => void;
    up: () => void;
  } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    return () => {
      const listeners = columnResizeListenersRef.current;
      if (listeners) {
        window.removeEventListener('mousemove', listeners.move);
        window.removeEventListener('mouseup', listeners.up);
        columnResizeListenersRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setActive(null);
  }, [searchQuery]);

  useEffect(() => {
    if (!parentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(parentRef.current);
    return () => observer.disconnect();
  }, []);

  const activeSheet = sheets?.[activeSheetIndex] || sheets?.[0];
  const actualDataColsCount = activeSheet?.columnCount || 0;
  const actualDataRowsCount = activeSheet?.data?.length || 0;

  // Calculate total columns: fill at least A-Z, plus enough to cover wide viewports
  const colsToFillViewport = containerSize.width > 0
    ? Math.ceil((containerSize.width - ROWNUM_W) / COL_W) + 2
    : MIN_SPREADSHEET_COLS;
  const totalCols = useMemo(() => {
    return Math.max(actualDataColsCount, MIN_SPREADSHEET_COLS, colsToFillViewport);
  }, [actualDataColsCount, colsToFillViewport]);

  const getColWidth = (colIdx: number) => columnWidths[colIdx] || COL_W;

  const totalWidth = useMemo(() => {
    let w = ROWNUM_W;
    for (let i = 0; i < totalCols; i++) {
      w += getColWidth(i);
    }
    return w;
  }, [totalCols, columnWidths]);

  // Optional: if the parser stores formulas, show them
  const formulas = (activeSheet as (SheetData & { formulas?: unknown[][] }) | undefined)?.formulas;

  // Draggable column width resizer (Excel / Google Sheets style)
  const handleMouseDownResize = (colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColRef.current = {
      colIdx,
      startX: e.clientX,
      startWidth: getColWidth(colIdx),
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return;
      const delta = moveEvent.clientX - resizingColRef.current.startX;
      const newWidth = Math.max(65, resizingColRef.current.startWidth + delta);
      setColumnWidths((prev) => ({
        ...prev,
        [resizingColRef.current!.colIdx]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      resizingColRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      columnResizeListenersRef.current = null;
    };

    columnResizeListenersRef.current = { move: handleMouseMove, up: handleMouseUp };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const rowsToFillViewport = containerSize.height > 0
    ? Math.ceil(containerSize.height / ROW_H) + 10
    : MIN_SPREADSHEET_ROWS;
  const minRows = Math.max(MIN_SPREADSHEET_ROWS, rowsToFillViewport);

type CellValue = string | number | boolean | null;

  const rows = useMemo(() => {
    if (!activeSheet?.data) {
      // Return empty padded rows
      return Array.from({ length: minRows }).map((_, i) => ({
        row: [] as CellValue[],
        origIdx: -1,
      }));
    }

    const q = searchQuery.trim().toLowerCase();
    let r = activeSheet.data.map((row, origIdx) => ({ row, origIdx }));

    if (q) {
      r = r.filter(({ row }) =>
        row.some((cell) => !isEmpty(cell) && String(cell).toLowerCase().includes(q))
      );
    }

    if (sort) {
      const { col, dir } = sort;
      const mult = dir === 'asc' ? 1 : -1;
      r.sort((x, y) => {
        const a = x.row[col];
        const b = y.row[col];
        if (isEmpty(a) && isEmpty(b)) return 0;
        if (isEmpty(a)) return 1; // empties always last
        if (isEmpty(b)) return -1;
        return compareCells(a, b) * mult;
      });
    }

    // Pad with empty rows to simulate Excel/Google Sheets full canvas
    if (r.length < minRows) {
      const padded = [...r];
      for (let i = r.length; i < minRows; i++) {
        padded.push({ row: [] as CellValue[], origIdx: -1 });
      }
      return padded;
    }

    return r;
  }, [activeSheet, searchQuery, sort, minRows]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 15,
  });

  const toggleSort = (col: number) => {
    setSort((prev) =>
      prev && prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    );
    setActive(null);
    parentRef.current?.scrollTo({ top: 0 });
  };

  const switchSheet = (idx: number) => {
    setActiveSheetIndex(idx);
    setSort(null);
    setActive(null);
    setSearchQuery('');
    setColumnWidths({});
  };

  if (!sheets || sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-app-subtext">
        <FileSpreadsheet className="w-12 h-12 mb-3 text-app-subtext/40" />
        <p className="text-sm">Empty or unparseable spreadsheet</p>
      </div>
    );
  }

  // Formula bar content
  const activeCellVal = active ? rows[active.row]?.row?.[active.col] : undefined;
  const activeOrigIdx = active ? rows[active.row]?.origIdx : undefined;
  const activeFormula = (active && activeOrigIdx !== undefined && activeOrigIdx >= 0)
    ? formulas?.[activeOrigIdx]?.[active.col]
    : undefined;

  let barText = '';
  if (active) {
    if (!isEmpty(activeFormula)) {
      const f = String(activeFormula);
      barText = f.startsWith('=') ? f : `=${f}`;
    } else {
      barText = isEmpty(activeCellVal) ? '' : String(activeCellVal);
    }
  }
  const cellName = active ? `${getColumnLabel(active.col)}${active.row + 1}` : '';
  const q = searchQuery.trim().toLowerCase();

  return (
    <div className="flex flex-col h-full bg-app-bg text-app-text select-lock overflow-hidden transition-colors duration-150">
      {/* Top Controls: Search & Meta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-app-surface border-b border-app-border">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-app-text font-medium min-w-0">
          <FileExtensionIcon filename={filename} className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[120px] sm:max-w-xs">{filename}</span>
          <span className="text-app-border">/</span>
          <span className="text-app-subtext truncate max-w-[100px] sm:max-w-none">{activeSheet.sheetName}</span>
          <span className="px-1.5 py-0.5 ml-1 text-[10px] bg-app-bg text-app-subtext rounded border border-app-border shrink-0">
            {searchQuery
              ? `${rows.filter((r) => r.origIdx >= 0).length.toLocaleString()} matching rows`
              : `${actualDataRowsCount.toLocaleString()} rows \u2022 ${actualDataColsCount} cols`}
          </span>
        </div>

        <div className="relative w-full sm:w-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cells..."
            className="w-full sm:w-64 px-3 py-1.5 pl-8 text-xs text-app-text bg-app-bg border border-app-border rounded focus:outline-none focus:border-app-accent transition-colors"
          />
          <Search className="w-3.5 h-3.5 text-app-subtext absolute left-2.5 top-2.5" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-xs text-app-subtext hover:text-app-text cursor-pointer p-0.5"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 bg-app-surface border-b border-app-border text-xs">
        <div className="w-16 shrink-0 px-2 py-1 text-center font-mono font-semibold bg-app-bg border border-app-border rounded text-app-text">
          {cellName || '—'}
        </div>
        <span className="text-app-subtext italic font-serif">fx</span>
        <div
          className="flex-1 min-w-0 px-2 py-1 font-mono bg-app-bg border border-app-border rounded truncate text-app-text"
          title={barText}
        >
          {barText || <span className="text-app-subtext/60">{active ? '' : 'Select a cell'}</span>}
        </div>
      </div>

      {/* Virtualized grid */}
      <div ref={parentRef} className="flex-1 overflow-auto relative bg-app-bg">
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* Sticky header */}
          <div className="sticky top-0 z-20 flex bg-app-surface shadow-xs" style={{ width: totalWidth, height: ROW_H }}>
            <div
              className="sticky left-0 z-30 shrink-0 flex items-center justify-center bg-app-surface border-b border-r border-app-border text-slate-400 text-xs font-mono font-semibold"
              style={{ width: ROWNUM_W }}
            >
              #
            </div>
            {Array.from({ length: totalCols }).map((_, colIdx) => {
              const isSorted = sort?.col === colIdx;
              const colW = getColWidth(colIdx);
              return (
                <div
                  key={colIdx}
                  className="relative shrink-0 flex items-center bg-app-surface border-b border-r border-app-border text-slate-300 hover:text-white hover:bg-app-hover text-xs font-semibold uppercase tracking-wider select-none group"
                  style={{ width: colW }}
                >
                  <button
                    onClick={() => toggleSort(colIdx)}
                    className="flex-1 h-full flex items-center justify-center gap-1 cursor-pointer overflow-hidden px-1"
                    title="Click to sort"
                  >
                    <span className="truncate">{getColumnLabel(colIdx)}</span>
                    {isSorted &&
                      (sort!.dir === 'asc' ? (
                        <ArrowUp className="w-3.5 h-3.5 text-app-accent shrink-0" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-app-accent shrink-0" />
                      ))}
                  </button>

                  {/* Excel / Google Sheets Draggable Column Resize Handle */}
                  <div
                    onMouseDown={(e) => handleMouseDownResize(colIdx, e)}
                    className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-cyan-400/70 active:bg-cyan-400 transition-colors z-20 flex items-center justify-center"
                    title="Drag to resize column width"
                  >
                    <div className="w-0.5 h-3.5 bg-white/20 group-hover:bg-cyan-300" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body */}
          {rows.length === 0 ? (
            <div className="py-12 text-center text-slate-400 italic text-sm">
              No matching cells found for &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: totalWidth }}>
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const rowItem = rows[vRow.index];
                const rowData = rowItem?.row || [];
                return (
                  <div
                    key={vRow.index}
                    className="absolute top-0 left-0 flex hover:bg-white/[0.04] group text-[13px]"
                    style={{
                      height: ROW_H,
                      width: totalWidth,
                      transform: `translateY(${vRow.start}px)`,
                    }}
                  >
                    <div
                      className="sticky left-0 z-10 shrink-0 flex items-center justify-center bg-app-surface group-hover:bg-app-hover border-r border-b border-app-border text-slate-400 select-none text-xs font-mono font-medium"
                      style={{ width: ROWNUM_W }}
                    >
                      {vRow.index + 1}
                    </div>
                    {Array.from({ length: totalCols }).map((_, colIdx) => {
                      const cellVal = rowData[colIdx];
                      const isHighlighted =
                        q && !isEmpty(cellVal) && String(cellVal).toLowerCase().includes(q);
                      const isActive = active?.row === vRow.index && active?.col === colIdx;
                      const colW = getColWidth(colIdx);
                      return (
                        <div
                          key={colIdx}
                          onClick={() => setActive({ row: vRow.index, col: colIdx })}
                          className={`shrink-0 flex items-center px-3 border-r border-b border-app-border/40 truncate cursor-cell transition-colors text-[13px] ${
                            isHighlighted ? 'bg-app-accentBg text-emerald-300 font-bold' : 'text-slate-100'
                          } ${isActive ? 'outline outline-2 -outline-offset-2 outline-cyan-400 bg-cyan-950/20' : ''}`}
                          style={{ width: colW }}
                          title={isEmpty(cellVal) ? '' : String(cellVal)}
                        >
                          <span className="truncate">{isEmpty(cellVal) ? '' : String(cellVal)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sheet Switcher Tabs */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-app-surface border-t border-app-border overflow-x-auto">
          <span className="text-[10px] font-semibold tracking-wider text-app-subtext uppercase mr-2">
            Sheets:
          </span>
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.sheetName}
              onClick={() => switchSheet(idx)}
              className={`px-3 py-1 text-xs rounded transition-all cursor-pointer ${
                activeSheetIndex === idx
                  ? 'bg-app-accent text-app-bg font-semibold shadow-xs'
                  : 'bg-app-bg text-app-subtext hover:text-app-text border border-app-border'
              }`}
            >
              {sheet.sheetName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}