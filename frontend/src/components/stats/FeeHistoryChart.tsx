"use client";

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

interface Props {
  blocks: { height: number; low: number; high: number }[];
  estimates: { height: number; rate: number }[];
  loading: boolean;
  scaleType: "log" | "linear";
}

export default function FeeHistoryChart({ blocks, estimates, loading, scaleType }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || loading || blocks.length === 0) return;

    // Clear previous
    d3.select(svgRef.current).selectAll("*").remove();

    const margin = { top: 50, right: 30, bottom: 50, left: 60 };
    const width = containerRef.current.clientWidth - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // ggplot background
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#ebebeb")
      .attr("rx", 8);

    const xDomain = d3.extent(blocks, d => d.height) as [number, number];
    const x = d3.scaleLinear().domain(xDomain).range([0, width]);

    // 1. CLIPPING: Only show estimates that fall within the block height range
    const visibleEstimates = estimates.filter(e => e.height >= xDomain[0] && e.height <= xDomain[1]);

    const yMaxBlocks = d3.max(blocks, d => d.high) || 100;
    const yMaxEstimates = d3.max(visibleEstimates, d => d.rate) || 0;
    
    // Generous top padding (20%) to ensure highest rate is visible
    const yMax = Math.max(yMaxBlocks, yMaxEstimates) * 1.2;

    // 2. SCALE PADDING: Start slightly below 0 (-0.5 or -1) for better visualization
    const yMin = scaleType === "log" ? -0.1 : -0.5;

    const y = scaleType === "log" 
      ? d3.scaleSymlog().domain([yMin, yMax]).range([height, 0]).constant(1)
      : d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

    // Grid lines
    const numTicks = Math.min(blocks.length, 10);
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(numTicks).tickSize(-height).tickFormat(() => ""))
      .selectAll("line").attr("stroke", "#fff").attr("stroke-width", 1.5);
    
    svg.append("g")
      .call(d3.axisLeft(y).ticks(10).tickSize(-width).tickFormat(() => ""))
      .selectAll("line").attr("stroke", "#fff").attr("stroke-width", 1.5);

    // 3. Area (p10 - p90)
    const area = d3.area<any>()
      .x(d => x(d.height))
      .y0(d => y(d.low))
      .y1(d => y(d.high))
      .curve(d3.curveMonotoneX);

    svg.append("path")
      .datum(blocks)
      .attr("fill", "#999")
      .attr("fill-opacity", 0.3)
      .attr("d", area);

    // 4. Fee Estimate Line (Clipped to blocks)
    if (visibleEstimates.length > 0) {
      const line = d3.line<any>()
        .x(d => x(d.height))
        .y(d => y(d.rate))
        .curve(d3.curveMonotoneX);

      svg.append("path")
        .datum(visibleEstimates.sort((a, b) => a.height - b.height))
        .attr("fill", "none")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 3)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("d", line);
    }

    // Axes
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(numTicks).tickFormat(d3.format("d")))
      .selectAll("text").attr("fill", "#666").style("font-size", "11px").style("font-weight", "bold");

    // Y Axis Ticks (filtering out negative labels if we don't want them visible)
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
      .attr("fill", "#666")
      .style("font-size", "11px")
      .style("font-weight", "bold");

    // Interaction Tooltip
    const tooltip = d3.select(containerRef.current)
      .append("div")
      .attr("class", "chart-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "var(--card)")
      .style("border", "1px solid var(--card-border)")
      .style("padding", "12px")
      .style("border-radius", "8px")
      .style("box-shadow", "0 10px 15px -3px rgba(0,0,0,0.1)")
      .style("pointer-events", "none")
      .style("z-index", "100")
      .style("color", "var(--foreground)");

    const mouseLine = svg.append("line")
      .attr("stroke", "#666")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4")
      .style("opacity", 0);

    const mouseG = svg.append("g").style("opacity", 0);
    mouseG.append("circle").attr("r", 4).attr("fill", "#3b82f6").attr("stroke", "#fff").attr("stroke-width", 2);

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mouseX] = d3.pointer(event);
        const heightVal = Math.round(x.invert(mouseX));
        
        const b = blocks.find(b => b.height === heightVal);
        const e = visibleEstimates.find(e => Math.round(e.height) === heightVal);

        if (b) {
          mouseLine.attr("x1", x(heightVal)).attr("x2", x(heightVal)).attr("y1", 0).attr("y2", height).style("opacity", 1);
          
          if (e) {
            mouseG.attr("transform", `translate(${x(heightVal)},${y(e.rate)})`).style("opacity", 1);
          }

          tooltip
            .style("visibility", "visible")
            .style("left", `${event.pageX + 15}px`)
            .style("top", `${event.pageY - 15}px`)
            .html(`
              <div class="space-y-1 text-xs">
                <div class="font-black border-b border-[var(--card-border)] pb-1 mb-1">BLOCK #${heightVal}</div>
                <div class="flex justify-between gap-4">
                  <span class="text-[var(--muted)]">Range:</span>
                  <span class="font-mono font-bold">${b.low.toFixed(1)} - ${b.high.toFixed(1)}</span>
                </div>
                ${e ? `
                <div class="flex justify-between gap-4">
                  <span class="text-[#3b82f6] font-bold">Estimate:</span>
                  <span class="font-mono font-black text-[#3b82f6]">${e.rate.toFixed(2)}</span>
                </div>` : ''}
              </div>
            `);
        }
      })
      .on("mouseleave", () => {
        tooltip.style("visibility", "hidden");
        mouseLine.style("opacity", 0);
        mouseG.style("opacity", 0);
      });

  }, [blocks, estimates, loading, scaleType]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] relative">
      <svg ref={svgRef} className="w-full h-full overflow-visible"></svg>
    </div>
  );
}
