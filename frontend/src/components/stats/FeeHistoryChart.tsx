"use client";

import React, { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

interface Props {
  blocks: { height: number; low: number; high: number }[];
  estimates: { height: number; rate: number }[];
  blockPolicyEstimates: { height: number; rate: number }[];
  loading: boolean;
  scaleType: "log" | "linear";
}

export default function FeeHistoryChart({ blocks, estimates, blockPolicyEstimates, loading, scaleType }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const draw = useCallback(() => {
    if (!svgRef.current || !containerRef.current || loading || blocks.length === 0) return;

    // Read theme tokens so the chart adapts to light/dark mode.
    const style = getComputedStyle(document.documentElement);
    const C = {
      chartBg:   style.getPropertyValue("--chart-bg").trim()   || "#f1f5f9",
      grid:      style.getPropertyValue("--chart-grid").trim() || "#ffffff",
      text:      style.getPropertyValue("--chart-text").trim() || "#6b7280",
      axis:      style.getPropertyValue("--chart-axis").trim() || "#94a3b8",
      dataBlue:  style.getPropertyValue("--data-blue").trim()  || "#3b82f6",
      muted:     style.getPropertyValue("--muted").trim()      || "#6b7280",
    };

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll("*").remove();

    // Reuse or create tooltip div (never leak new ones)
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

    // Plot area background
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", C.chartBg)
      .attr("rx", 8);

    const xDomain = d3.extent(blocks, d => d.height) as [number, number];
    const x = d3.scaleLinear().domain(xDomain).range([0, width]);

    // 1. CLIPPING: Only show estimates that fall within the block height range
    const visibleEstimates = estimates.filter(e => e.height >= xDomain[0] && e.height <= xDomain[1]);
    const visibleBpEstimates = blockPolicyEstimates.filter(e => e.height >= xDomain[0] && e.height <= xDomain[1]);

    const yMaxBlocks = d3.max(blocks, d => d.high) || 100;
    const yMaxEstimates = d3.max(visibleEstimates, d => d.rate) || 0;
    const yMaxBpEstimates = d3.max(visibleBpEstimates, d => d.rate) || 0;

    // Generous top padding (20%) to ensure highest rate is visible
    const yMax = Math.max(yMaxBlocks, yMaxEstimates, yMaxBpEstimates) * 1.2;

    // 2. SCALE PADDING: Start slightly below 0 (-0.5 or -1) for better visualization
    const yMin = scaleType === "log" ? -0.1 : -0.5;

    const y = scaleType === "log"
      ? d3.scaleSymlog().domain([yMin, yMax]).range([height, 0]).constant(1)
      : d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

    // Grid lines
    const numTicks = Math.min(blocks.length, 10);
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(numTicks).tickSize(-height).tickFormat(() => ""))
      .selectAll("line").attr("stroke", C.grid).attr("stroke-width", 1.5);

    svg.append("g")
      .call(d3.axisLeft(y).ticks(10).tickSize(-width).tickFormat(() => ""))
      .selectAll("line").attr("stroke", C.grid).attr("stroke-width", 1.5);

    // 3. Area (p10 - p90)
    const area = d3.area<any>()
      .x(d => x(d.height))
      .y0(d => y(d.low))
      .y1(d => y(d.high))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(blocks)
      .attr("fill", C.muted)
      .attr("fill-opacity", 0.45)
      .attr("d", area);

    const estimateLine = d3.line<any>()
      .x(d => x(d.height))
      .y(d => y(d.rate))
      .curve(d3.curveMonotoneX);

    // Split sorted estimates into contiguous segments (consecutive block heights)
    // so gaps in data show as breaks in the line, not smooth interpolations.
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

    // 4. Fee Estimate Line (Clipped to blocks)
    for (const segment of splitIntoSegments(visibleEstimates)) {
      svg.append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", C.dataBlue)
        .attr("stroke-width", 2.5)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("d", estimateLine);
    }

    // 5. Block Policy Estimate Line
    for (const segment of splitIntoSegments(visibleBpEstimates)) {
      svg.append("path")
        .datum(segment)
        .attr("fill", "none")
        .attr("stroke", "#d97706")
        .attr("stroke-width", 2.5)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("d", estimateLine);
    }

    // Axes
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(numTicks).tickFormat(d3.format("d")))
      .selectAll("text").attr("fill", C.text).style("font-size", "11px").style("font-weight", "500");

    // Y Axis Ticks
    const yTicks =
      scaleType === "log"
        ? [0, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000].filter(v => v <= yMax)
        : 10;
    const yAxis = d3.axisLeft(y).tickFormat(d3.format("d"));
    if (Array.isArray(yTicks)) {
      yAxis.tickValues(yTicks);
    } else {
      yAxis.ticks(yTicks);
    }

    svg.append("g")
      .call(yAxis)
      .selectAll("text")
      .attr("fill", C.text)
      .style("font-size", "11px")
      .style("font-weight", "500");

    // Axis labels
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 55)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .style("letter-spacing", "0.1em")
      .attr("fill", C.axis)
      .text("BLOCK HEIGHT");

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -65)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .style("letter-spacing", "0.1em")
      .attr("fill", C.axis)
      .text("FEE RATE (sat/vB)");

    // Build O(1) lookup maps for tooltip (mousemove fires many times/sec)
    const blockMap = new Map(blocks.map(b => [b.height, b]));
    const estMap = new Map(visibleEstimates.map(e => [Math.round(e.height), e]));
    const bpMap = new Map(visibleBpEstimates.map(e => [Math.round(e.height), e]));

    // Interaction Tooltip
    const mouseLine = svg.append("line")
      .attr("stroke", "#666")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4")
      .style("opacity", 0);

    const mouseG = svg.append("g").style("opacity", 0);
    mouseG.append("circle").attr("r", 4).attr("fill", "#3b82f6").attr("stroke", "#fff").attr("stroke-width", 2);

    const mouseGBp = svg.append("g").style("opacity", 0);
    mouseGBp.append("circle").attr("r", 4).attr("fill", "#d97706").attr("stroke", "#fff").attr("stroke-width", 2);

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mouseX] = d3.pointer(event);
        const heightVal = Math.round(x.invert(mouseX));

        const b = blockMap.get(heightVal);
        const e = estMap.get(heightVal);
        const bp = bpMap.get(heightVal);

        if (b) {
          mouseLine.attr("x1", x(heightVal)).attr("x2", x(heightVal)).attr("y1", 0).attr("y2", height).style("opacity", 1);

          if (e) {
            mouseG.attr("transform", `translate(${x(heightVal)},${y(e.rate)})`).style("opacity", 1);
          } else {
            mouseG.style("opacity", 0);
          }
          if (bp) {
            mouseGBp.attr("transform", `translate(${x(heightVal)},${y(bp.rate)})`).style("opacity", 1);
          } else {
            mouseGBp.style("opacity", 0);
          }

          // Position tooltip relative to the container, not the page
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
              ${e ? `
              <div class="flex justify-between gap-4">
                <span class="text-[#3b82f6] font-bold">mempool_policy:</span>
                <span class="font-mono font-black text-[#3b82f6]">${e.rate.toFixed(2)}</span>
              </div>` : ''}
              ${bp ? `
              <div class="flex justify-between gap-4">
                <span class="text-[#d97706] font-bold">block_policy:</span>
                <span class="font-mono font-black text-[#d97706]">${bp.rate.toFixed(2)}</span>
              </div>` : ''}
            </div>
          `;
        }
      })
      .on("mouseleave", () => {
        tooltipEl.style.visibility = "hidden";
        mouseLine.style("opacity", 0);
        mouseG.style("opacity", 0);
        mouseGBp.style("opacity", 0);
      });

  }, [blocks, estimates, blockPolicyEstimates, loading, scaleType]);

  // Draw on data change and resize
  useEffect(() => {
    draw();

    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => draw());
    ro.observe(container);

    return () => {
      ro.disconnect();
      // Clean up tooltip on unmount
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
