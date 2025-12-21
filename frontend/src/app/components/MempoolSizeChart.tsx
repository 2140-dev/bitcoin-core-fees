"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { api } from "@/lib/api";

interface MempoolDataPoint {
  timestamp: Date;
  size: number;
  totalFees: number;
}

export default function MempoolSizeChart() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<MempoolDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const mempoolInfo = await api.getMempoolInfo();
        const now = new Date();

        setData((prev) => {
          const newData = [
            ...prev,
            {
              timestamp: now,
              size: mempoolInfo.size,
              totalFees: mempoolInfo.total_fee,
            },
          ];
          // Keep only last 20 data points
          return newData.slice(-20);
        });
      } catch (error) {
        console.error("Failed to fetch mempool data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 40, left: 80 };
    const width = 800 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

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
      .domain([0, d3.max(data, (d) => d.size) || 10000] as [number, number])
      .nice()
      .range([height, 0]);

    // Bar width
    const barWidth = width / data.length - 2;

    // Add bars
    g.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", (d) => xScale(d.timestamp) - barWidth / 2)
      .attr("width", barWidth)
      .attr("y", (d) => yScale(d.size))
      .attr("height", (d) => height - yScale(d.size))
      .attr("fill", "#cc7400")
      .attr("opacity", 0.7)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("opacity", 1).attr("fill", "#ff9500");

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
            `<strong>Mempool Size:</strong> ${d.size.toLocaleString()} txs<br/>` +
              `<strong>Total Fees:</strong> ${(d.totalFees / 100000000).toFixed(
                4
              )} BTC<br/>` +
              `<strong>Time:</strong> ${d.timestamp.toLocaleTimeString()}`
          )
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 10}px`);

        tooltip.transition().duration(200).style("opacity", 1);
      })
      .on("mouseout", function () {
        d3.selectAll(".tooltip").remove();
        d3.select(this).attr("opacity", 0.7).attr("fill", "#cc7400");
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
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickFormat((d) => d3.format(".2s")(d as number))
      )
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
      .text("Mempool Size (transactions)");

    g.append("text")
      .attr(
        "transform",
        `translate(${width / 2}, ${height + margin.bottom - 5})`
      )
      .style("text-anchor", "middle")
      .style("fill", "#e2e8f0")
      .style("font-size", "14px")
      .text("Time");
  }, [data]);

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-900/70 rounded-xl border border-gray-800">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cc7400]"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 backdrop-blur-sm rounded-xl border border-gray-800 p-6">
      <h3 className="text-xl font-semibold text-gray-200 mb-4">
        Mempool Size Over Time
      </h3>
      <svg
        ref={svgRef}
        width="800"
        height="300"
        className="w-full h-auto max-w-full"
      />
    </div>
  );
}
