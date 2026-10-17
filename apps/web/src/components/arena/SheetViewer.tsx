'use client';

import React, { useState, useMemo, useRef } from 'react';
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

type SortState = { col: number; dir: 'asc' | 'desc' } | null;
type ActiveCell = { row: number; col: number } | null; // row = ORIGINAL row index

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
  const an = typeof a === 'number' ? a : Number(a);
  const bn = typeof b === 'number' ? b : Number(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function SheetViewer({ sheets, filename }: SheetViewerProps) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [active, setActive] = useState<ActiveCell>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const activeSheet = sheets?.[activeSheetIndex] || sheets?.[0];
  const maxCols = activeSheet?.columnCount || 0;
  const totalWidth = ROWNUM_W + maxCols * COL_W;

  // Optional: if the parser stores formulas, show them (see note below the code)
  const formulas = (activeSheet as (SheetData & { formulas?: unknown[][] }) | undefined)?.formulas;

  const rows = useMemo(() => {
    if (!activeSheet?.data) return [];
    let r = activeSheet.data.map((row, origIdx) => ({ row, origIdx }));

    const q = searchQuery.trim().toLowerCase();
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
    return r;
  }, [activeSheet, searchQuery, sort]);

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
    parentRef.current?.scrollTo({ top: 0 });
  };

  const switchSheet = (idx: number) => {
    setActiveSheetIndex(idx);
    setSort(null);
    setActive(null);
    setSearchQuery('');
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
  const activeRaw = active ? activeSheet.data?.[active.row]?.[active.col] : undefined;
  const activeFormula = active ? formulas?.[active.row]?.[active.col] : undefined;
  let barText = '';
  if (active) {
    if (!isEmpty(activeFormula)) {
      const f = String(activeFormula);
      barText = f.startsWith('=') ? f : `=${f}`;
    } else {
      barText = isEmpty(activeRaw) ? '' : String(activeRaw);
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
            {rows.length.toLocaleString()} rows &bull; {maxCols} cols
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
          {barText || <span className="text-app-subtext/60">Select a cell</span>}
        </div>
      </div>

      {/* Virtualized grid */}
      <div ref={parentRef} className="flex-1 overflow-auto relative">
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* Sticky header */}
          <div className="sticky top-0 z-20 flex bg-app-surface shadow-xs" style={{ width: totalWidth, height: ROW_H }}>
            <div
              className="sticky left-0 z-30 shrink-0 flex items-center justify-center bg-app-surface border-b border-r border-app-border text-app-subtext text-xs"
              style={{ width: ROWNUM_W }}
            >
              #
            </div>
            {Array.from({ length: maxCols }).map((_, colIdx) => {
              const isSorted = sort?.col === colIdx;
              return (
                <button
                  key={colIdx}
                  onClick={() => toggleSort(colIdx)}
                  className="shrink-0 flex items-center justify-center gap-1 bg-app-surface border-b border-r border-app-border text-app-subtext hover:text-app-text hover:bg-app-hover text-xs font-semibold uppercase tracking-wider cursor-pointer"
                  style={{ width: COL_W }}
                  title="Click to sort"
                >
                  {getColumnLabel(colIdx)}
                  {isSorted &&
                    (sort!.dir === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-app-accent" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-app-accent" />
                    ))}
                </button>
              );
            })}
          </div>

          {/* Body */}
          {rows.length === 0 ? (
            <div className="py-12 text-center text-app-subtext italic text-xs">
              No matching cells found for &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: totalWidth }}>
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const { row, origIdx } = rows[vRow.index];
                return (
                  <div
                    key={origIdx}
                    className="absolute top-0 left-0 flex hover:bg-app-hover group text-xs"
                    style={{
                      height: ROW_H,
                      width: totalWidth,
                      transform: `translateY(${vRow.start}px)`,
                    }}
                  >
                    <div
                      className="sticky left-0 z-10 shrink-0 flex items-center justify-center bg-app-surface group-hover:bg-app-hover border-r border-b border-app-border text-app-subtext select-none text-[11px] font-medium"
                      style={{ width: ROWNUM_W }}
                    >
                      {origIdx + 1}
                    </div>
                    {Array.from({ length: maxCols }).map((_, colIdx) => {
                      const cellVal = row[colIdx];
                      const isHighlighted =
                        q && !isEmpty(cellVal) && String(cellVal).toLowerCase().includes(q);
                      const isActive = active?.row === origIdx && active?.col === colIdx;
                      return (
                        <div
                          key={colIdx}
                          onClick={() => setActive({ row: origIdx, col: colIdx })}
                          className={`shrink-0 flex items-center px-3 border-r border-b border-app-border/40 truncate cursor-cell ${
                            isHighlighted ? 'bg-app-accentBg text-app-text font-bold' : 'text-app-text'
                          } ${isActive ? 'outline outline-2 -outline-offset-2 outline-app-accent' : ''}`}
                          style={{ width: COL_W }}
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