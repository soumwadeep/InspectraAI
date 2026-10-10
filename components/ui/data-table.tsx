"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  ColumnFiltersState,
  getFilteredRowModel,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  enableSearch?: boolean;
  searchPlaceholder?: string;
  searchKey?: string;
  pageSize?: number;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  enableSearch = false,
  searchPlaceholder = "Search...",
  searchKey,
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize,
      },
    },
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (searchKey) {
      table.getColumn(searchKey)?.setFilterValue(e.target.value);
    }
  };

  return (
    <div className="space-y-4">
      {enableSearch && searchKey && (
        <div className="flex items-center gap-2">
          <Input
            placeholder={searchPlaceholder}
            onChange={handleSearch}
            className="max-w-sm bg-surface/50 border-border focus:border-primary"
          />
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface/30">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-border/50 hover:bg-surface/50"
              >
                {headerGroup.headers.map((header) => {
                  return header.isPlaceholder ? (
                    <TableHead key={header.id} />
                  ) : (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "bg-surface-elevated/50 text-secondary-text",
                        header.column.getIsSorted() === "ascending" &&
                          "text-primary",
                        header.column.getIsSorted() === "descending" &&
                          "text-primary",
                      )}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-border/30 hover:bg-surface/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-secondary-text"
                >
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={
            !table.getPaginationRowModel().pageCount ||
            table.state.pagination.pageIndex === 0
          }
        >
          Previous
        </Button>
        <span className="text-sm text-secondary-text">
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={
            !table.getPaginationRowModel().pageCount ||
            table.getState().pagination.pageIndex + 1 >=
              table.getPageCount()
          }
        >
          Next
        </Button>
      </div>
    </div>
  );
}
