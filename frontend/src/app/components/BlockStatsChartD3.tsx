"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface BlockData {
  height: number;
  p25: number;
  p75: number;
  avgFee: number;
  status?: "overpaid" | "underpaid" | "within_range";
}

interface BlockStatsChartProps {
  blocks: BlockData[];
  startHeight: number;
  endHeight: number;
}

export default function BlockStatsChartD3({
  blocks,
  startHeight,
  endHeight,
}: BlockStatsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || blocks.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 80, bottom: 60, left: 80 };
    const width = 1000 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([startHeight, endHeight])
      .range([0, width]);

    const yScaleLeft = d3
      .scaleLinear()
      .domain([0, d3.max(blocks, (d) => Math.max(d.p25, d.p75)) || 100] as [
        number,
        number
      ])
      .nice()
      .range([height, 0]);

    const yScaleRight = d3
      .scaleLinear()
      .domain([0, d3.max(blocks, (d) => d.avgFee) || 100] as [number, number])
      .nice()
      .range([height, 0]);

    // Area generator for p25-p75 range
    const area = d3
      .area<BlockData>()
      .x((d) => xScale(d.height))
      .y0((d) => yScaleLeft(d.p25))
      .y1((d) => yScaleLeft(d.p75))
      .curve(d3.curveMonotoneX);

    // Line generator for average fee
    const feeLine = d3
      .line<BlockData>()
      .x((d) => xScale(d.height))
      .y((d) => yScaleRight(d.avgFee))
      .curve(d3.curveMonotoneX);

    // Add gradient for area
    const gradient = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", "rangeGradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#cc7400")
      .attr("stop-opacity", 0.4);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#cc7400")
      .attr("stop-opacity", 0.1);

    // Add area for p25-p75 range
    g.append("path")
      .datum(blocks)
      .attr("fill", "url(#rangeGradient)")
      .attr("d", area);

    // Add p25 line
    g.append("path")
      .datum(blocks)
      .attr("fill", "none")
      .attr("stroke", "#cc7400")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.6)
      .attr(
        "d",
        d3
          .line<BlockData>()
          .x((d) => xScale(d.height))
          .y((d) => yScaleLeft(d.p25))
          .curve(d3.curveMonotoneX)(blocks)
      );

    // Add p75 line
    g.append("path")
      .datum(blocks)
      .attr("fill", "none")
      .attr("stroke", "#cc7400")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.6)
      .attr(
        "d",
        d3
          .line<BlockData>()
          .x((d) => xScale(d.height))
          .y((d) => yScaleLeft(d.p75))
          .curve(d3.curveMonotoneX)(blocks)
      );

    // Add average fee line
    g.append("path")
      .datum(blocks)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 3)
      .attr("d", feeLine);

    // Add interactive dots for average fee
    g.selectAll(".fee-dot")
      .data(blocks)
      .enter()
      .append("circle")
      .attr("class", "fee-dot")
      .attr("cx", (d) => xScale(d.height))
      .attr("cy", (d) => yScaleRight(d.avgFee))
      .attr("r", 4)
      .attr("fill", "#10b981")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("r", 6);

        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "tooltip")
          .style("opacity", 0)
          .style("position", "absolute")
          .style("background", "rgba(0, 0, 0, 0.9)")
          .style("color", "white")
          .style("padding", "10px 14px")
          .style("border-radius", "6px")
          .style("pointer-events", "none")
          .style("font-size", "12px")
          .style("z-index", "1000")
          .style("box-shadow", "0 4px 6px rgba(0,0,0,0.3)");

        const statusColor =
          d.status === "overpaid"
            ? "#ef4444"
            : d.status === "underpaid"
            ? "#f59e0b"
            : "#10b981";

        tooltip
          .html(
            `<div style="margin-bottom: 4px;"><strong>Block ${d.height.toLocaleString()}</strong></div>` +
              `<div style="color: ${statusColor};">Status: ${
                d.status || "unknown"
              }</div>` +
              `<div>Avg Fee: ${d.avgFee.toFixed(2)} sat/vB</div>` +
              `<div>Range: ${d.p25.toFixed(2)} - ${d.p75.toFixed(2)}</div>`
          )
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 10}px`);

        tooltip.transition().duration(200).style("opacity", 1);
      })
      .on("mouseout", function () {
        d3.selectAll(".tooltip").remove();
        d3.select(this).attr("r", 4);
      });

    // X Axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(8)
          .tickFormat((d) => d3.format(",")(d as number))
      )
      .attr("color", "#94a3b8")
      .selectAll("text")
      .style("fill", "#94a3b8")
      .style("font-size", "12px");

    // Left Y Axis (Range)
    g.append("g")
      .call(d3.axisLeft(yScaleLeft).ticks(6))
      .attr("color", "#cc7400")
      .selectAll("text")
      .style("fill", "#cc7400")
      .style("font-size", "12px");

    // Right Y Axis (Fee Rate)
    g.append("g")
      .attr("transform", `translate(${width},0)`)
      .call(d3.axisRight(yScaleRight).ticks(6))
      .attr("color", "#10b981")
      .selectAll("text")
      .style("fill", "#10b981")
      .style("font-size", "12px");

    // Axis labels
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 0 - margin.left)
      .attr("x", 0 - height / 2)
      .attr("dy", "1em")
      .style("text-anchor", "middle")
      .style("fill", "#cc7400")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Block Stat Range (p25-p75)");

    g.append("text")
      .attr("transform", `translate(${width + 20}, ${height / 2}) rotate(90)`)
      .style("text-anchor", "middle")
      .style("fill", "#10b981")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Average Fee Rate (sat/vB)");

    g.append("text")
      .attr(
        "transform",
        `translate(${width / 2}, ${height + margin.bottom - 10})`
      )
      .style("text-anchor", "middle")
      .style("fill", "#e2e8f0")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Block Height");

    // Legend
    const legend = g
      .append("g")
      .attr("transform", `translate(${width - 200}, 20)`);

    legend
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", "url(#rangeGradient)");

    legend
      .append("text")
      .attr("x", 18)
      .attr("y", 9)
      .style("fill", "#e2e8f0")
      .style("font-size", "12px")
      .text("Range (p25-p75)");

    legend
      .append("line")
      .attr("x1", 0)
      .attr("x2", 12)
      .attr("y1", 20)
      .attr("y2", 20)
      .attr("stroke", "#10b981")
      .attr("stroke-width", 3);

    legend
      .append("text")
      .attr("x", 18)
      .attr("y", 23)
      .style("fill", "#e2e8f0")
      .style("font-size", "12px")
      .text("Avg Fee Rate");
  }, [blocks, startHeight, endHeight]);

  return (
    <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/80 backdrop-blur-sm rounded-2xl border border-slate-700 p-6">
      <h2 className="text-slate-200 text-lg mb-2">
        Block Statistics & Fee Rates (D3.js)
      </h2>

      <p className="text-slate-400 mb-6">
        Interval: {startHeight.toLocaleString()} - {endHeight.toLocaleString()}
      </p>

      <div className="overflow-x-auto">
        <svg ref={svgRef} width="1000" height="400" className="w-full h-auto" />
      </div>
    </div>
  );
}
