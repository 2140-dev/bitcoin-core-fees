"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { api } from "@/lib/api";

interface FeeRateDataPoint {
  timestamp: Date;
  feeRate: number;
  blockHeight: number;
}

export default function FeeRateTimeline() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<FeeRateDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch recent fee estimates
        const estimates = await Promise.all([
          api.getUnifiedEstimate("mempool", 1, 50),
          api.getUnifiedEstimate("mempool", 2, 50),
          api.getUnifiedEstimate("mempool", 3, 50),
        ]);

        const blockchainInfo = await api.getBlockchainInfo();
        const now = new Date();

        const newData: FeeRateDataPoint[] = estimates
          .map((est, idx) => ({
            timestamp: new Date(now.getTime() - (2 - idx) * 60000), // 1 min intervals
            feeRate: est.fee_rate_sat_per_vb ?? 0,
            blockHeight: blockchainInfo.blocks - (2 - idx),
          }))
          .filter((d) => d.feeRate > 0);

        setData(newData);
      } catch (error) {
        console.error("Failed to fetch fee rate data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!svgRef.current || data.length === 0 || loading) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.timestamp) as [Date, Date])
      .range([0, width]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.feeRate) || 100] as [number, number])
      .nice()
      .range([height, 0]);

    // Line generator
    const line = d3
      .line<FeeRateDataPoint>()
      .x((d) => xScale(d.timestamp))
      .y((d) => yScale(d.feeRate))
      .curve(d3.curveMonotoneX);

    // Area generator
    const area = d3
      .area<FeeRateDataPoint>()
      .x((d) => xScale(d.timestamp))
      .y0(height)
      .y1((d) => yScale(d.feeRate))
      .curve(d3.curveMonotoneX);

    // Add gradient
    const gradient = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", "feeGradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#cc7400")
      .attr("stop-opacity", 0.3);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#cc7400")
      .attr("stop-opacity", 0.05);

    // Add area
    g.append("path")
      .datum(data)
      .attr("fill", "url(#feeGradient)")
      .attr("d", area);

    // Add line
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#cc7400")
      .attr("stroke-width", 3)
      .attr("d", line);

    // Add dots
    g.selectAll(".dot")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d) => xScale(d.timestamp))
      .attr("cy", (d) => yScale(d.feeRate))
      .attr("r", 5)
      .attr("fill", "#cc7400")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .on("mouseover", function (event, d) {
        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "tooltip")
          .style("opacity", 0)
          .style("position", "absolute")
          .style("background", "rgba(0, 0, 0, 0.9)")
          .style("color", "white")
          .style("padding", "8px 12px")
          .style("border-radius", "4px")
          .style("pointer-events", "none")
          .style("font-size", "12px")
          .style("z-index", "1000");

        tooltip
          .html(
            `<strong>Fee Rate:</strong> ${d.feeRate.toFixed(2)} sat/vB<br/>` +
              `<strong>Block:</strong> ${d.blockHeight.toLocaleString()}<br/>` +
              `<strong>Time:</strong> ${d.timestamp.toLocaleTimeString()}`
          )
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 10}px`);

        tooltip.transition().duration(200).style("opacity", 1);

        d3.select(this).attr("r", 7).attr("fill", "#ff9500");
      })
      .on("mouseout", function () {
        d3.selectAll(".tooltip").remove();
        d3.select(this).attr("r", 5).attr("fill", "#cc7400");
      });

    // X Axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickFormat((d) => {
            if (d instanceof Date) {
              return d3.timeFormat("%H:%M:%S")(d);
            }
            return "";
          })
      )
      .attr("color", "#94a3b8")
      .selectAll("text")
      .style("fill", "#94a3b8")
      .style("font-size", "12px");

    // Y Axis
    g.append("g")
      .call(d3.axisLeft(yScale).ticks(6))
      .attr("color", "#94a3b8")
      .selectAll("text")
      .style("fill", "#94a3b8")
      .style("font-size", "12px");

    // Axis labels
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 0 - margin.left)
      .attr("x", 0 - height / 2)
      .attr("dy", "1em")
      .style("text-anchor", "middle")
      .style("fill", "#e2e8f0")
      .style("font-size", "14px")
      .text("Fee Rate (sat/vB)");

    g.append("text")
      .attr(
        "transform",
        `translate(${width / 2}, ${height + margin.bottom - 5})`
      )
      .style("text-anchor", "middle")
      .style("fill", "#e2e8f0")
      .style("font-size", "14px")
      .text("Time");
  }, [data, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-900/70 rounded-xl border border-gray-800">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cc7400]"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 backdrop-blur-sm rounded-xl border border-gray-800 p-6">
      <h3 className="text-xl font-semibold text-gray-200 mb-4">
        Fee Rate Timeline (Real-time)
      </h3>
      <svg
        ref={svgRef}
        width="800"
        height="400"
        className="w-full h-auto max-w-full"
      />
    </div>
  );
}
