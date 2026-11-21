import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, ZoomIn, ZoomOut, ExternalLink } from "lucide-react";

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function ProductZoom({ photo, name }) {
  const image = useRef(null),
    detail = useRef(null),
    source = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0, dw: 0, dh: 0, native: 0 });
  const [point, setPoint] = useState({ x: 0.5, y: 0.5 }),
    [wanted, setWanted] = useState(2.5),
    [active, setActive] = useState(false);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 740px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 740px)");
    const change = () => {
      setMobile(media.matches);
      setActive(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  function measure() {
    if (!image.current || !source.current || !detail.current) return;
    const w = image.current.clientWidth,
      h = image.current.clientHeight;
    setSize({
      w,
      h,
      dw: detail.current.clientWidth || source.current.clientWidth,
      dh: detail.current.clientHeight || source.current.clientHeight,
      native: image.current.naturalWidth,
    });
  }
  useLayoutEffect(() => {
    const resize = new ResizeObserver(measure);
    for (const node of [image.current, detail.current, source.current])
      resize.observe(node);
    measure();
    return () => resize.disconnect();
  }, [photo, mobile]);
  const max = size.w ? Math.max(1, Math.min(5, size.native / size.w)) : 1;
  const scale = Math.max(1, Math.min(wanted, max));
  const bigW = size.w * scale,
    bigH = size.h * scale;
  const offset = (length, view, p) =>
    length <= view
      ? (view - length) / 2
      : -clamp(p * length - view / 2, 0, length - view);
  const left = offset(bigW, size.dw, point.x),
    top = offset(bigH, size.dh, point.y);
  function focusAt(event, node) {
    const r = node.getBoundingClientRect();
    if (r.width && r.height)
      setPoint({
        x: clamp((event.clientX - r.left) / r.width, 0, 1),
        y: clamp((event.clientY - r.top) / r.height, 0, 1),
      });
  }
  function resetView() {
    setActive(false);
    setPoint({ x: 0.5, y: 0.5 });
    setWanted(2.5);
  }
  function panKeys(e) {
    const vector = {
      ArrowLeft: [-0.09, 0],
      ArrowRight: [0.09, 0],
      ArrowUp: [0, -0.09],
      ArrowDown: [0, 0.09],
    }[e.key];
    if (vector) {
      e.preventDefault();
      if (mobile) setActive(true);
      setPoint((old) => ({
        x: clamp(old.x + vector[0], 0, 1),
        y: clamp(old.y + vector[1], 0, 1),
      }));
    }
  }
  return (
    <section
      className="photo-inspector"
      aria-label="Product photo zoom"
      onKeyDown={(event) => {
        if (active && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          resetView();
          source.current?.focus();
        }
      }}
    >
      <div className={"photo-zoom-grid" + (active ? " inspecting" : "")}>
        <button
          ref={source}
          type="button"
          className="zoom-source"
          aria-label={active ? "Reset photo view" : "Inspect product photo"}
          aria-pressed={active}
          onKeyDown={panKeys}
          onClick={() => active ? resetView() : setActive(true)}
          onPointerDown={(e) => {
            if (!active) focusAt(e, image.current);
          }}
          onPointerMove={(e) => {
            if (!active && e.pointerType === "mouse") focusAt(e, image.current);
          }}
        >
          <span className="zoom-image-box">
            <img
              ref={image}
              src={photo}
              alt={name}
              draggable="false"
              onLoad={measure}
            />
            {!mobile && size.w > 0 && (
              <span
                className="zoom-lens"
                style={{
                  width: Math.min(size.w, size.dw / scale),
                  height: Math.min(size.h, size.dh / scale),
                  left: Math.max(0, -left / scale),
                  top: Math.max(0, -top / scale),
                }}
              />
            )}
          </span>
          {mobile && !active && (
            <span className="zoom-indicator">
              <ZoomIn size={15} /> Tap to zoom
            </span>
          )}
        </button>
        <div
          ref={detail}
          className="zoom-detail"
          role="img"
          aria-label={"Magnified detail of " + name}
          onPointerDown={(e) => {
            if (mobile) {
              e.currentTarget.setPointerCapture(e.pointerId);
              focusAt(e, detail.current);
            }
          }}
          onPointerMove={(e) => {
            if (mobile && e.buttons === 1) focusAt(e, detail.current);
          }}
        >
          {size.w > 0 && (
            <img
              src={photo}
              alt=""
              draggable="false"
              style={{ width: bigW, height: bigH, left, top }}
            />
          )}
        </div>
      </div>
      <div className="zoom-tools">
        <span>
          {mobile
            ? active
              ? "Drag to inspect"
              : "Product photo"
            : active
              ? "Detail locked"
              : "Move over the photo to inspect"}
        </span>
        <div>
          <button
            aria-label="Reduce photo zoom"
            disabled={scale <= 1.01}
            onClick={() => {
              setWanted(Math.max(1, scale - 0.5));
              if (mobile) setActive(true);
            }}
          >
            <Minus size={15} />
          </button>
          <output aria-label="Photo zoom level">
            {Number(scale.toFixed(1))}×
          </output>
          <button
            aria-label="Increase photo zoom"
            disabled={scale >= max - 0.01}
            onClick={() => {
              setWanted(Math.min(max, scale + 0.5));
              if (mobile) setActive(true);
            }}
          >
            <Plus size={15} />
          </button>
          {active && (
            <button
              aria-label="Reset photo zoom"
              onClick={resetView}
            >
              <ZoomOut size={15} />
            </button>
          )}
          <a
            href={photo}
            target="_blank"
            rel="noreferrer"
            aria-label="Open full-size product photo"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>
    </section>
  );
}
