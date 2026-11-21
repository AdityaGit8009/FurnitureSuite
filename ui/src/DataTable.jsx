import React, {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  useState,
} from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
function content(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(content).join(" ");
  if (isValidElement(node))
    return node.props["data-sort"] ?? content(node.props.children);
  return String(node);
}
function canSort(name) {
  return Boolean(name) && name !== "Action" && name !== "Actions";
}
function compare(a, b) {
  const currency = /^[₹$]?\s*-?[\d,]+(?:\.\d+)?$/;
  if (currency.test(a) && currency.test(b))
    return (
      Number(a.replace(/[^\d.-]/g, "")) - Number(b.replace(/[^\d.-]/g, ""))
    );
  return collator.compare(a, b);
}
export function DataTable({
  children,
  label = "Records",
  searchable = true,
  initialSize = 10,
  context = "",
  pagingName = "rows",
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState({ column: -1, descending: false }),
    [page, setPage] = useState(1),
    [size, setSize] = useState(initialSize);
  const sections = Children.toArray(children);
  const head = sections.find((s) => s.type === "thead"),
    body = sections.find((s) => s.type === "tbody");
  const headers = Children.toArray(head.props.children.props.children),
    rows = Children.toArray(body.props.children);
  const filter = query.trim().toLocaleLowerCase();
  const result = useMemo(() => {
    let items = rows.map((row) => ({
      row,
      values: Children.toArray(row.props.children).map((td) =>
        String(content(td)).trim(),
      ),
    }));
    if (filter)
      items = items.filter((x) =>
        filter
          .split(/\s+/)
          .every((w) =>
            x.values.some((v) => v.toLocaleLowerCase().includes(w)),
          ),
      );
    if (sort.column >= 0)
      items.sort(
        (a, b) =>
          compare(a.values[sort.column] || "", b.values[sort.column] || "") *
          (sort.descending ? -1 : 1),
      );
    return items;
  }, [body.props.children, filter, sort]);
  const pages = Math.max(1, Math.ceil(result.length / size)),
    current = Math.min(pages, page);
  React.useEffect(() => setPage(1), [context, filter, size]);
  return (
    <div className="data-grid" role="region" aria-label={label}>
      <div className="data-tools">
        {searchable && (
          <label className="grid-search">
            <Search size={15} />
            <input
              type="search"
              aria-label={"Search " + label}
              placeholder="Search table"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
        )}
        <label className="mobile-grid-sort">
          Sort{" "}
          <select
            aria-label={"Sort " + label}
            value={
              sort.column < 0 ? "" : sort.column + (sort.descending ? "d" : "a")
            }
            onChange={(e) => {
              const v = e.target.value;
              setSort(
                v
                  ? { column: parseInt(v), descending: v.endsWith("d") }
                  : { column: -1, descending: false },
              );
              setPage(1);
            }}
          >
            <option value="">Original order</option>
            {headers.flatMap((h, i) => {
              const n = content(h.props.children).trim();
              return !canSort(n)
                ? []
                : [
                    <option key={i + "a"} value={i + "a"}>
                      {n} ↑
                    </option>,
                    <option key={i + "d"} value={i + "d"}>
                      {n} ↓
                    </option>,
                  ];
            })}
          </select>
        </label>
        <label className="grid-size">
          Rows per page{" "}
          <select
            aria-label={"Rows per page for " + label}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          >
            {[...new Set([10, 20, 50, initialSize])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n}>{n}</option>
              ))}
          </select>
        </label>
      </div>
      <div className="grid-scroll">
        <table aria-label={label}>
          <thead>
            <tr>
              {headers.map((h, i) => {
                const name = content(h.props.children).trim();
                if (!canSort(name))
                  return cloneElement(h, { key: i, scope: "col" });
                const active = sort.column === i;
                const Icon = active
                  ? sort.descending
                    ? ArrowDown
                    : ArrowUp
                  : ChevronsUpDown;
                return cloneElement(
                  h,
                  {
                    key: i,
                    scope: "col",
                    "aria-sort": active
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none",
                  },
                  <button
                    type="button"
                    className="sort-column"
                    aria-label={"Sort by " + name}
                    onClick={() => {
                      setSort({
                        column: i,
                        descending: active && !sort.descending,
                      });
                      setPage(1);
                    }}
                  >
                    {h.props.children}
                    <Icon aria-hidden="true" size={13} />
                  </button>,
                );
              })}
            </tr>
          </thead>
          <tbody>
            {result
              .slice((current - 1) * size, current * size)
              .map((x) => x.row)}
          </tbody>
        </table>
      </div>
      {filter && !result.length && (
        <p className="hint" role="status">
          No matching records.
        </p>
      )}
      <div className="grid-footer">
        <small aria-live="polite">
          {result.length
            ? (current - 1) * size +
              1 +
              "–" +
              Math.min(current * size, result.length)
            : "0"}{" "}
          of {result.length}
        </small>
        <nav aria-label={label + " pages"}>
          <button
            type="button"
            aria-label={"Previous " + pagingName}
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span>
            {current} / {pages}
          </span>
          <button
            type="button"
            aria-label={"Next " + pagingName}
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </nav>
      </div>
    </div>
  );
}
