"use client";

import React, { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { FeeSeries } from "../../types/api";
import { FEE_SERIES_BY_KEY } from "../../lib/feeSeries";

interface Props {
  blocks: { height: number; low: number; high: number }[];
  series: FeeSeries[];
  loading: boolean;
  scaleType: "log" | "linear";
}

const DEFAULT_COLOR = "#64748b";

export default function FeeHistoryChart({ blocks, series, loading, scaleType }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const draw = useCallback(() => {
    if (!svgRef.current || !containerRef.current || loading || blocks.length === 0) return;

    const style = getComputedStyle(document.documentElement);
    const C = {
      chartBg: style.getPropertyValue("--chart-bg").trim() || "#f1f5f9",
      grid: style.getPropertyValue("--chart-grid").trim() || "#ffffff",
      text: style.getPropertyValue("--chart-text").trim() || "#6b7280",
      axis: style.getPropertyValue("--chart-axis").trim() || "#94a3b8",
      muted: style.getPropertyValue("--muted").trim() || "#6b7280",
    };

    d3.select(svgRef.current).selectAll("*").remove();

    if (!tooltipRef.current) {
      tooltipRef.current = document.createElement("div");
      tooltipRef.current.className = "chart-tooltip";
      Object.assign(tooltipRef.current.style, {
        position: "absolute",
        visibility: "hidden",
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        padding: "12px",
        borderRadius: "8px",
        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
        pointerEvents: "none",
        zIndex: "100",
        color: "var(--foreground)",
      });
      containerRef.current.appendChild(tooltipRef.current);
    }
    const tooltipEl = tooltipRef.current;
    tooltipEl.style.visibility = "hidden";

    const margin = { top: 50, right: 30, bottom: 70, left: 80 };
    const width = containerRef.current.clientWidth - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    svg.append("rect").attr("width", width).attr("height", height).attr("fill", C.chartBg).attr("rx", 8);

    const xDomain = d3.extent(blocks, (d) => d.height) as [number, number];
    const x = d3.scaleLinear().domain(xDomain).range([0, width]);

    // Clip each series to the visible block-height window.
    const visibleSeries = series.map((s) => ({
      ...s,
      meta: FEE_SERIES_BY_KEY[s.key],
      points: s.points.filter((p) => p.height >= xDomain[0] && p.height <= xDomain[1]),
    }));

    const yMaxBlocks = d3.max(blocks, (d) => d.high) || 100;
    const yMaxSeries = d3.max(visibleSeries.flatMap((s) => s.points.map((p) => p.rate))) || 0;
    const yMax = Math.max(yMaxBlocks, yMaxSeries) * 1.2;
    const yMin = scaleType === "log" ? -0.1 : -0.5;

    const y = scaleType === "log"
      ? d3.scaleSymlog().domain([yMin, yMax]).range([height, 0]).constant(1)
      : d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

    const numTicks = Math.min(blocks.length, 10);
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(numTicks).tickSize(-height).tickFormat(() => ""))
      .selectAll("line").attr("stroke", C.grid).attr("stroke-width", 1.5);
    svg.append("g")
      .call(d3.axisLeft(y).ticks(10).tickSize(-width).tickFormat(() => ""))
      .selectAll("line").attr("stroke", C.grid).attr("stroke-width", 1.5);

    // p10–p90 band
    const area = d3.area<{ height: number; low: number; high: number }>()
      .x((d) => x(d.height)).y0((d) => y(d.low)).y1((d) => y(d.high)).curve(d3.curveMonotoneX);
    svg.append("path").datum(blocks).attr("fill", C.muted).attr("fill-opacity", 0.45).attr("d", area);

    const line = d3.line<{ height: number; rate: number }>()
      .x((d) => x(d.height)).y((d) => y(d.rate)).curve(d3.curveMonotoneX);

    // Break the line where block heights aren't consecutive, so gaps show.
    function splitIntoSegments(data: { height: number; rate: number }[]) {
      const sorted = [...data].sort((a, b) => a.height - b.height);
      const segments: typeof sorted[] = [];
      let current: typeof sorted = [];
      for (const pt of sorted) {
        if (current.length > 0 && pt.height - current[current.length - 1].height > 1) {
          segments.push(current);
          current = [];
        }
        current.push(pt);
      }
      if (current.length > 0) segments.push(current);
      return segments;
    }

    for (const s of visibleSeries) {
      const color = s.meta?.color || DEFAULT_COLOR;
      for (const segment of splitIntoSegments(s.points)) {
        svg.append("path")
          .datum(segment)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 2.25)
          .attr("stroke-linejoin", "round")
          .attr("stroke-linecap", "round")
          .attr("d", line);
      }
    }

    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(numTicks).tickFormat(d3.format("d")))
      .selectAll("text").attr("fill", C.text).style("font-size", "11px").style("font-weight", "500");

    const yTicks = scaleType === "log"
      ? [0, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000].filter((v) => v <= yMax)
      : 10;
    const yAxis = d3.axisLeft(y).tickFormat(d3.format("d"));
    if (Array.isArray(yTicks)) yAxis.tickValues(yTicks); else yAxis.ticks(yTicks);
    svg.append("g").call(yAxis).selectAll("text").attr("fill", C.text).style("font-size", "11px").style("font-weight", "500");

    svg.append("text").attr("x", width / 2).attr("y", height + 55).attr("text-anchor", "middle")
      .style("font-size", "10px").style("font-weight", "600").style("letter-spacing", "0.1em").attr("fill", C.axis).text("BLOCK HEIGHT");
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", -65).attr("text-anchor", "middle")
      .style("font-size", "10px").style("font-weight", "600").style("letter-spacing", "0.1em").attr("fill", C.axis).text("FEE RATE (sat/vB)");

    // Tooltip lookups
    const blockMap = new Map(blocks.map((b) => [b.height, b]));
    const seriesMaps = visibleSeries.map((s) => ({
      meta: s.meta,
      color: s.meta?.color || DEFAULT_COLOR,
      label: s.meta?.label || s.key,
      map: new Map(s.points.map((p) => [Math.round(p.height), p])),
    }));

    const mouseLine = svg.append("line").attr("stroke", "#666").attr("stroke-width", 1).attr("stroke-dasharray", "4,4").style("opacity", 0);
    const dots = seriesMaps.map((s) => {
      const g = svg.append("g").style("opacity", 0);
      g.append("circle").attr("r", 4).attr("fill", s.color).attr("stroke", "#fff").attr("stroke-width", 2);
      return g;
    });

    svg.append("rect")
      .attr("width", width).attr("height", height).attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mouseX] = d3.pointer(event);
        const heightVal = Math.round(x.invert(mouseX));
        const b = blockMap.get(heightVal);
        if (!b) return;

        mouseLine.attr("x1", x(heightVal)).attr("x2", x(heightVal)).attr("y1", 0).attr("y2", height).style("opacity", 1);

        let rows = "";
        seriesMaps.forEach((s, i) => {
          const pt = s.map.get(heightVal);
          if (pt) {
            dots[i].attr("transform", `translate(${x(heightVal)},${y(pt.rate)})`).style("opacity", 1);
            rows += `<div class="flex justify-between gap-4">
                <span class="font-bold" style="color:${s.color}">${s.label}:</span>
                <span class="font-mono font-black" style="color:${s.color}">${pt.rate.toFixed(2)}</span>
              </div>`;
          } else {
            dots[i].style("opacity", 0);
          }
        });

        const containerRect = containerRef.current!.getBoundingClientRect();
        tooltipEl.style.visibility = "visible";
        tooltipEl.style.left = `${event.clientX - containerRect.left + 15}px`;
        tooltipEl.style.top = `${event.clientY - containerRect.top - 15}px`;
        tooltipEl.innerHTML = `
          <div class="space-y-1 text-xs">
            <div class="font-black border-b border-[var(--card-border)] pb-1 mb-1">BLOCK #${heightVal}</div>
            <div class="flex justify-between gap-4">
              <span class="text-[var(--muted)]">p10–p90:</span>
              <span class="font-mono font-bold">${b.low.toFixed(1)} - ${b.high.toFixed(1)}</span>
            </div>
            ${rows}
          </div>`;
      })
      .on("mouseleave", () => {
        tooltipEl.style.visibility = "hidden";
        mouseLine.style("opacity", 0);
        dots.forEach((d) => d.style("opacity", 0));
      });
  }, [blocks, series, loading, scaleType]);

  useEffect(() => {
    draw();
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (tooltipRef.current && tooltipRef.current.parentNode) {
        tooltipRef.current.parentNode.removeChild(tooltipRef.current);
        tooltipRef.current = null;
      }
    };
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] relative">
      <svg ref={svgRef} className="w-full h-full overflow-visible"></svg>
    </div>
  );
}
