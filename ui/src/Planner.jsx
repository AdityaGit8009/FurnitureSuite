import React, { useRef, useState } from "react";
import { Modal } from "./lib";
const parseSize = (p) => {
  let parts = p.dimensions.match(/[0-9]+(?:\.[0-9]+)?/g) || [];
  return [Number(parts[0]) || 80, Number(parts[1]) || 80];
};
export function Planner({ items, close }) {
  let [room, R] = useState(() => {
      try {
        return (
          JSON.parse(localStorage.getItem("studio-plan")) || {
            width: 450,
            depth: 400,
            pieces: [],
          }
        );
      } catch {
        return { width: 450, depth: 400, pieces: [] };
      }
    }),
    [pick, P] = useState(items[0]?.id),
    [sel, S] = useState(null),
    [notice, N] = useState("");
  const ref = useRef(null),
    drag = useRef(null);
  function change(f) {
    R((r) => ({ ...r, ...f }));
    N("");
  }
  function alter(id, fn) {
    R((r) => ({
      ...r,
      pieces: r.pieces.map((x) => (x.key === id ? fn(x) : x)),
    }));
    N("");
  }
  function add() {
    const p = items.find((x) => x.id === Number(pick));
    if (!p) return;
    let [w, d] = parseSize(p),
      key = crypto.randomUUID();
    if (w > room.width || d > room.depth) {
      N("The piece is larger than this room.");
      return;
    }
    change({
      pieces: [...room.pieces, { key, name: p.name, w, d, x: 0, y: 0 }],
    });
    S(key);
  }
  const selected = room.pieces.find((x) => x.key === sel);
  return (
    <Modal wide title="Room planner" close={close}>
      <p>
        Set the internal room dimensions in centimetres. Add pieces and drag
        them into position.
      </p>
      <div className="row wrap">
        {["width", "depth"].map((k) => (
          <label className="field" key={k}>
            Room {k} (cm)
            <input
              type="number"
              value={room[k]}
              min="100"
              max="1600"
              onChange={(e) => {
                let v = Number(e.target.value);
                if (v > 0 && v <= 1600) change({ [k]: v });
              }}
            />
          </label>
        ))}
      </div>
      <div className="tools">
        <select
          value={pick}
          aria-label="Furniture for layout"
          onChange={(e) => P(e.target.value)}
        >
          {items.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={add}>Add piece</button>
      </div>
      <div
        ref={ref}
        style={{
          position: "relative",
          aspectRatio: room.width + "/" + room.depth,
          backgroundColor: "#edf3e9",
          border: "2px solid #758f7c",
          overflow: "hidden",
          touchAction: "none",
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          let b = ref.current.getBoundingClientRect(),
            { key, dx, dy } = drag.current;
          alter(key, (x) => ({
            ...x,
            x: Math.max(
              0,
              Math.min(
                room.width - x.w,
                ((e.clientX - b.left) / b.width) * room.width - dx,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                room.depth - x.d,
                ((e.clientY - b.top) / b.height) * room.depth - dy,
              ),
            ),
          }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {room.pieces.map((x) => (
          <button
            key={x.key}
            onClick={() => S(x.key)}
            onPointerDown={(e) => {
              let b = ref.current.getBoundingClientRect();
              e.target.setPointerCapture(e.pointerId);
              S(x.key);
              drag.current = {
                key: x.key,
                dx: ((e.clientX - b.left) / b.width) * room.width - x.x,
                dy: ((e.clientY - b.top) / b.height) * room.depth - x.y,
              };
            }}
            style={{
              position: "absolute",
              left: (x.x / room.width) * 100 + "%",
              top: (x.y / room.depth) * 100 + "%",
              width: (x.w / room.width) * 100 + "%",
              height: (x.d / room.depth) * 100 + "%",
              padding: 2,
              overflow: "hidden",
              fontSize: 11,
              background: x.key === sel ? "#254a38" : "#d1c4a7",
              color: x.key === sel ? "white" : "#23322a",
            }}
          >
            {x.name}
          </button>
        ))}
      </div>
      {selected && (
        <div className="row wrap">
          <span>
            {selected.name} · {selected.w} × {selected.d} cm
          </span>
          <button onClick={() => alter(sel, (x) => ({ ...x, w: x.d, d: x.w }))}>
            Rotate 90°
          </button>
          <button
            onClick={() =>
              change({ pieces: room.pieces.filter((x) => x.key !== sel) })
            }
          >
            Remove
          </button>
        </div>
      )}
      <div className="row">
        <button
          className="primary"
          onClick={() => {
            localStorage.setItem("studio-plan", JSON.stringify(room));
            N("Layout saved on this device.");
          }}
        >
          Save layout
        </button>
        {notice}
      </div>
    </Modal>
  );
}
