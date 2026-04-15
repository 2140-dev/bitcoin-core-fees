"use client";

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { MempoolDiagramPoint } from "../../types/api";

interface Props {
  data: MempoolDiagramPoint[];
  percentiles: Record<string, number>;
  blocksToShow: number | "all";
  loading: boolean;
}

export default function MempoolDiagramChart({ data, percentiles, blocksToShow, loading }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || loading || data.length === 0) return;

    // Read theme tokens so the chart adapts to light/dark mode.
    const style = getComputedStyle(document.documentElement);
    const C = {
      chartBg: style.getPropertyValue("--chart-bg").trim()   || "#f1f5f9",
      grid:    style.getPropertyValue("--chart-grid").trim() || "#ffffff",
      text:    style.getPropertyValue("--chart-text").trim() || "#6b7280",
      axis:    style.getPropertyValue("--chart-axis").trim() || "#94a3b8",
      accent:  style.getPropertyValue("--accent").trim()     || "#f97316",
      fg:      style.getPropertyValue("--foreground").trim() || "#0f172a",
      muted:   style.getPropertyValue("--muted").trim()      || "#6b7280",
    };

    d3.select(svgRef.current).selectAll("*").remove();

    const margin = { top: 40, right: 60, bottom: 75, left: 90 };
    const width = containerRef.current.clientWidth - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", C.chartBg)
      .attr("rx", 8);

    const plotData = [{ weight: 0, fee: 0 }, ...data];
    const BLOCK_WEIGHT = 4000000;
    const maxDataWeight = data[data.length - 1].weight;
    const currentMaxWeight = blocksToShow === "all" ? maxDataWeight : blocksToShow * BLOCK_WEIGHT;
    
    const filteredData = plotData.filter(d => d.weight <= currentMaxWeight);

    const x = d3.scaleLinear().domain([0, currentMaxWeight]).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(filteredData, d => d.fee) || 1]).range([height, 0]);

    // Grid
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(10).tickSize(-height).tickFormat(() => ""))
      .selectAll("line").attr("stroke", C.grid).attr("stroke-width", 1.5);
    svg.append("g")
      .call(d3.axisLeft(y).ticks(10).tickSize(-width).tickFormat(() => ""))
      .selectAll("line").attr("stroke", C.grid).attr("stroke-width", 1.5);

    // --- Block Boundaries ---
    const numBlocks = Math.floor(currentMaxWeight / BLOCK_WEIGHT);
    for (let i = 1; i <= numBlocks; i++) {
      const xPos = x(i * BLOCK_WEIGHT);
      if (xPos <= width) {
        svg.append("line").attr("x1", xPos).attr("x2", xPos).attr("y1", 0).attr("y2", height)
          .attr("stroke", C.muted).attr("stroke-dasharray", "4,4").style("opacity", 0.4);
      }
    }

    // --- Growth Curve ---
    const line = d3.line<any>().x(d => x(d.weight)).y(d => y(d.fee)).curve(d3.curveLinear);
    svg.append("path").datum(filteredData).attr("fill", "none").attr("stroke", C.accent).attr("stroke-width", 3).attr("d", line);

    // --- Global Window Percentiles ---
    // Collect anchor positions first so we can spread labels that stack up
    // when the curve is nearly flat (low-fee / testnet scenario).
    type LabelDatum = { posX: number; posY: number; perc: string; rate: number };
    const labelData: LabelDatum[] = Object.entries(percentiles).map(([perc, rate]) => {
      // perc is the feerate percentile label (e.g. 95 = top 5% by feerate).
      // The actual weight position is the complement: (1 - perc/100).
      const weightFraction = 1 - Number(perc) / 100;
      const targetW = weightFraction * currentMaxWeight;
      const bisect = d3.bisector((d: any) => d.weight).left;
      const idx = bisect(filteredData, targetW);
      let targetFee = 0;
      if (idx > 0 && idx < filteredData.length) {
        const d0 = filteredData[idx - 1];
        const d1 = filteredData[idx];
        const t = (targetW - d0.weight) / (d1.weight - d0.weight);
        targetFee = d0.fee + t * (d1.fee - d0.fee);
      } else if (idx < filteredData.length) {
        targetFee = filteredData[idx].fee;
      }
      return { posX: x(targetW), posY: y(targetFee), perc, rate };
    }).sort((a, b) => a.posX - b.posX);

    // Each label block = feerate (10px) + percentile (8px) stacked above the dot.
    // BLOCK_H: total height of one label block (both lines + inner gap).
    // MIN_GAP: minimum space between the bottom of one block and top of the next.
    const BLOCK_H = 26;
    const MIN_GAP = 6;
    const SLOT = BLOCK_H + MIN_GAP; // 32px per slot

    // `labelY[i]` = y of the TOP of label block i (feerate line).
    // Start each block 8px above its dot so the block sits entirely above the curve.
    const labelY = labelData.map(d => d.posY - BLOCK_H - 8);

    // Forward pass: push blocks down so no block overlaps the one above.
    for (let i = 1; i < labelY.length; i++) {
      if (labelY[i] < labelY[i - 1] + SLOT) {
        labelY[i] = labelY[i - 1] + SLOT;
      }
    }
    // Backward pass: if the last block spills below the chart, pull it up
    // and cascade upward to maintain gaps.
    labelY[labelY.length - 1] = Math.min(labelY[labelY.length - 1], height - BLOCK_H - 4);
    for (let i = labelY.length - 2; i >= 0; i--) {
      if (labelY[i + 1] - labelY[i] < SLOT) {
        labelY[i] = labelY[i + 1] - SLOT;
      }
    }
    // Clamp first block to chart top, then forward-pass once more to re-enforce gaps.
    labelY[0] = Math.max(labelY[0], 4);
    for (let i = 1; i < labelY.length; i++) {
      if (labelY[i] < labelY[i - 1] + SLOT) {
        labelY[i] = labelY[i - 1] + SLOT;
      }
    }

    labelData.forEach(({ posX, posY, perc, rate }, i) => {
      const blockTop = labelY[i];
      const blockBottom = blockTop + BLOCK_H;
      const leaderNeeded = posY > blockBottom + 4;

      // Dot on the curve.
      svg.append("circle").attr("cx", posX).attr("cy", posY).attr("r", 4)
        .attr("fill", C.fg).attr("stroke", C.chartBg).attr("stroke-width", 1.5);

      // Leader line from dot up to bottom of label block.
      if (leaderNeeded) {
        svg.append("line")
          .attr("x1", posX).attr("y1", posY - 6)
          .attr("x2", posX).attr("y2", blockBottom + 2)
          .attr("stroke", C.axis).attr("stroke-width", 1).attr("stroke-dasharray", "2,2");
      }

      // Feerate label at top of block.
      svg.append("text").attr("x", posX).attr("y", blockTop + 10)
        .attr("text-anchor", "middle").style("font-size", "10px").style("font-weight", "600")
        .attr("fill", C.fg).text(`${rate.toFixed(1)}`);

      // Percentile label at bottom of block.
      svg.append("text").attr("x", posX).attr("y", blockTop + BLOCK_H)
        .attr("text-anchor", "middle").style("font-size", "8px").style("font-weight", "500")
        .attr("fill", C.muted).text(`p${perc}`);
    });

    // Axes ticks
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${(Number(d) / 1000000).toFixed(1)}M`))
      .selectAll("text").attr("fill", C.text).style("font-size", "10px").style("font-weight", "500");

    svg.append("g").call(d3.axisLeft(y).ticks(10))
      .selectAll("text").attr("fill", C.text).style("font-size", "10px").style("font-weight", "500");

    // Axis labels
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 60)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .style("letter-spacing", "0.1em")
      .attr("fill", C.axis)
      .text("CUMULATIVE WEIGHT (WU)");

    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -75)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .style("letter-spacing", "0.1em")
      .attr("fill", C.axis)
      .text("CUMULATIVE FEE (BTC)");

  }, [data, percentiles, blocksToShow, loading]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] relative">
      <svg ref={svgRef} className="w-full h-full overflow-visible"></svg>
    </div>
  );
}
