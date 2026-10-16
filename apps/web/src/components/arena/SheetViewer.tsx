'use client';

import React, { useState, useMemo } from 'react';
import { SheetData } from '@/lib/types';
import { Search, Table, FileSpreadsheet } from 'lucide-react';
import { FileExtensionIcon } from './FileIcon';

interface SheetViewerProps {
  sheets: SheetData[];
  filename: string;
}

// Convert 0 -> 'A', 1 -> 'B', 25 -> 'Z', 26 -> 'AA', etc.
function getColumnLabel(index: number): string {
  let label = '';
  let num = index;
  while (num >= 0) {
    label = String.fromCharCode((num % 26) + 65) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}

export function SheetViewer({ sheets, filename }: SheetViewerProps) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const activeSheet = sheets[activeSheetIndex] || sheets[0];

  const filteredData = useMemo(() => {
    if (!activeSheet || !activeSheet.data) return [];
    if (!searchQuery.trim()) return activeSheet.data;

    const query = searchQuery.toLowerCase();
    return activeSheet.data.filter((row) =>
      row.some((cell) =>
        cell !== null && cell !== undefined && String(cell).toLowerCase().includes(query)
      )
    );
  }, [activeSheet, searchQuery]);

  if (!sheets || sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-app-subtext">
        <FileSpreadsheet className="w-12 h-12 mb-3 text-app-subtext/40" />
        <p className="text-sm">Empty or unparseable spreadsheet</p>
      </div>
    );
  }

  const maxCols = activeSheet?.columnCount || 0;

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
            {filteredData.length} rows &bull; {maxCols} cols
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

      {/* Virtualized/Scrollable Spreadsheet Grid */}
      <div className="flex-1 overflow-auto relative">
        <table className="w-full border-collapse text-xs text-left">
          <thead className="sticky top-0 z-20 bg-app-surface shadow-xs">
            <tr>
              {/* Row index top-left corner */}
              <th className="sticky left-0 z-30 w-12 px-2 py-1.5 bg-app-surface border-b border-r border-app-border text-app-subtext text-center font-normal">
                #
              </th>
              {Array.from({ length: maxCols }).map((_, colIdx) => (
                <th
                  key={colIdx}
                  className="px-3 py-1.5 bg-app-surface border-b border-r border-app-border text-app-subtext font-semibold uppercase tracking-wider text-center min-w-[120px]"
                >
                  {getColumnLabel(colIdx)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border/40">
            {filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={maxCols + 1}
                  className="py-12 text-center text-app-subtext italic"
                >
                  No matching cells found for &quot;{searchQuery}&quot;
                </td>
              </tr>
            ) : (
              filteredData.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-app-hover transition-colors group"
                >
                  {/* Sticky row number column */}
                  <td className="sticky left-0 z-10 px-2 py-1.5 bg-app-surface group-hover:bg-app-hover border-r border-b border-app-border text-app-subtext text-center select-none text-[11px] font-medium">
                    {rowIdx + 1}
                  </td>
                  {Array.from({ length: maxCols }).map((_, colIdx) => {
                    const cellVal = row[colIdx];
                    const isHighlighted =
                      searchQuery.trim() &&
                      cellVal !== null &&
                      cellVal !== undefined &&
                      String(cellVal).toLowerCase().includes(searchQuery.toLowerCase());

                    return (
                      <td
                        key={colIdx}
                        className={`px-3 py-1.5 border-r border-b border-app-border/40 truncate max-w-[280px] ${
                          isHighlighted
                            ? 'bg-app-accentBg text-app-text font-bold'
                            : 'text-app-text'
                        }`}
                        title={cellVal !== null && cellVal !== undefined ? String(cellVal) : ''}
                      >
                        {cellVal !== null && cellVal !== undefined
                          ? String(cellVal)
                          : ''}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
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
              onClick={() => setActiveSheetIndex(idx)}
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
