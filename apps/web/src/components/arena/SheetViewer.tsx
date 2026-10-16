'use client';

import React, { useState, useMemo } from 'react';
import { SheetData } from '@/lib/types';
import { Search, Table, FileSpreadsheet } from 'lucide-react';

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
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">
        <FileSpreadsheet className="w-12 h-12 mb-3 text-slate-600" />
        <p className="text-sm">Empty or unparseable spreadsheet</p>
      </div>
    );
  }

  const maxCols = activeSheet?.columnCount || 0;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 select-lock overflow-hidden">
      {/* Top Controls: Search & Meta */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
          <Table className="w-3.5 h-3.5" />
          <span>{filename}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{activeSheet.sheetName}</span>
          <span className="px-1.5 py-0.5 ml-2 text-[10px] bg-slate-800 text-slate-300 rounded border border-slate-700">
            {filteredData.length} rows &bull; {maxCols} cols
          </span>
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cells..."
            className="w-48 sm:w-64 px-3 py-1 pl-8 text-xs text-white bg-slate-950/80 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-400 transition-colors font-mono"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1.5 text-xs text-slate-400 hover:text-white"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Virtualized/Scrollable Spreadsheet Grid */}
      <div className="flex-1 overflow-auto relative">
        <table className="w-full border-collapse text-xs font-mono text-left">
          <thead className="sticky top-0 z-20 bg-slate-900 shadow-md">
            <tr>
              {/* Row index top-left corner */}
              <th className="sticky left-0 z-30 w-12 px-2 py-1.5 bg-slate-900 border-b border-r border-slate-800 text-slate-500 text-center font-normal">
                #
              </th>
              {Array.from({ length: maxCols }).map((_, colIdx) => (
                <th
                  key={colIdx}
                  className="px-3 py-1.5 bg-slate-900 border-b border-r border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-center min-w-[120px]"
                >
                  {getColumnLabel(colIdx)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60">
            {filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={maxCols + 1}
                  className="py-12 text-center text-slate-500 italic"
                >
                  No matching cells found for &quot;{searchQuery}&quot;
                </td>
              </tr>
            ) : (
              filteredData.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-slate-900/50 transition-colors group"
                >
                  {/* Sticky row number column */}
                  <td className="sticky left-0 z-10 px-2 py-1.5 bg-slate-950 group-hover:bg-slate-900/80 border-r border-b border-slate-800/80 text-slate-600 text-center select-none font-mono text-[11px]">
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
                        className={`px-3 py-1.5 border-r border-b border-slate-800/60 truncate max-w-[280px] ${
                          isHighlighted
                            ? 'bg-cyan-500/20 text-cyan-200 font-bold'
                            : 'text-slate-300'
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
        <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-900/90 border-t border-slate-800 overflow-x-auto">
          <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase mr-2">
            Sheets:
          </span>
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.sheetName}
              onClick={() => setActiveSheetIndex(idx)}
              className={`px-3 py-1 text-xs font-mono rounded-md transition-all cursor-pointer ${
                activeSheetIndex === idx
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
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
