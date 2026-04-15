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

    d3.select(svgRef.current).selectAll("*").remove();

    const margin = { top: 40, right: 60, bottom: 60, left: 80 };
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
      .attr("fill", "#ebebeb")
      .attr("rx", 8);

    const plotData = [{ weight: 0, fee: 0 }, ...data];
    const BLOCK_WEIGHT = 4000000;
    const maxDataWeight = data[data.length - 1].weight;
    const currentMaxWeight = blocksToShow === "all" ? maxDataWeight : blocksToShow * BLOCK_WEIGHT;
    
    const filteredData = plotData.filter(d => d.weight <= currentMaxWeight);

    const x = d3.scaleLinear().domain([0, currentMaxWeight]).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(filteredData, d => d.fee) || 1]).range([height, 0]);

    // Grid - Faded
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(10).tickSize(-height).tickFormat(() => ""))
      .selectAll("line").attr("stroke", "#fff").attr("stroke-width", 1.5);
    svg.append("g")
      .call(d3.axisLeft(y).ticks(10).tickSize(-width).tickFormat(() => ""))
      .selectAll("line").attr("stroke", "#fff").attr("stroke-width", 1.5);

    // --- Block Boundaries ---
    const numBlocks = Math.floor(currentMaxWeight / BLOCK_WEIGHT);
    for (let i = 1; i <= numBlocks; i++) {
      const xPos = x(i * BLOCK_WEIGHT);
      if (xPos <= width) {
        svg.append("line").attr("x1", xPos).attr("x2", xPos).attr("y1", 0).attr("y2", height)
          .attr("stroke", "#666").attr("stroke-dasharray", "4,4").style("opacity", 0.3);
      }
    }

    // --- Growth Curve ---
    const line = d3.line<any>().x(d => x(d.weight)).y(d => y(d.fee)).curve(d3.curveLinear);
    svg.append("path").datum(filteredData).attr("fill", "none").attr("stroke", "#f97316").attr("stroke-width", 3.5).attr("d", line);

    // --- Global Window Percentiles ---
    Object.entries(percentiles).forEach(([perc, rate]) => {
      const targetW = (Number(perc) / 100) * currentMaxWeight;
      
      const bisect = d3.bisector((d: any) => d.weight).left;
      const idx = bisect(filteredData, targetW);
      let targetFee = 0;
      if (idx > 0 && idx < filteredData.length) {
        const d0 = filteredData[idx-1];
        const d1 = filteredData[idx];
        const t = (targetW - d0.weight) / (d1.weight - d0.weight);
        targetFee = d0.fee + t * (d1.fee - d0.fee);
      } else if (idx < filteredData.length) {
        targetFee = filteredData[idx].fee;
      }

      const posX = x(targetW);
      const posY = y(targetFee);

      svg.append("circle").attr("cx", posX).attr("cy", posY).attr("r", 4).attr("fill", "#333").attr("stroke", "#fff").attr("stroke-width", 1.5);
      
      // Feerate Label
      svg.append("text").attr("x", posX).attr("y", posY - 15).attr("text-anchor", "middle").style("font-size", "10px").style("font-weight", "black").attr("fill", "#333").text(`${rate.toFixed(1)}`);
      
      // Percentile label (faded)
      svg.append("text").attr("x", posX).attr("y", posY + 20).attr("text-anchor", "middle").style("font-size", "8px").style("font-weight", "bold").attr("fill", "#999").text(`${perc}%`);
    });

    // Axes Labels - Faded
    svg.append("g").attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${(Number(d) / 1000000).toFixed(1)}M`))
      .selectAll("text").attr("fill", "#aaa").style("font-size", "10px").style("font-weight", "bold");

    svg.append("g").call(d3.axisLeft(y).ticks(10))
      .selectAll("text").attr("fill", "#aaa").style("font-size", "10px").style("font-weight", "bold");

  }, [data, percentiles, blocksToShow, loading]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] relative">
      <svg ref={svgRef} className="w-full h-full overflow-visible"></svg>
    </div>
  );
}
