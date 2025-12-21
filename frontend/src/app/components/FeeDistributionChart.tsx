"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { api } from "@/lib/api";

interface PercentileData {
  percentile: number;
  feeRate: number;
}

export default function FeeDistributionChart() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<PercentileData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const percentiles = await api.getMempoolPercentiles([
          10, 25, 50, 75, 90,
        ]);
        const newData: PercentileData[] = percentiles.percentiles
          .filter((p) => p.feerate_sat_per_vb != null)
          .map((p) => ({
            percentile: p.percentile,
            feeRate: p.feerate_sat_per_vb!,
          }));

        setData(newData);
      } catch (error) {
        console.error("Failed to fetch percentile data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!svgRef.current || data.length === 0 || loading) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 30, bottom: 60, left: 80 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleBand()
      .domain(data.map((d) => `${d.percentile}th`))
      .range([0, width])
      .padding(0.2);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.feeRate) || 100] as [number, number])
      .nice()
      .range([height, 0]);

    // Color scale
    const colorScale = d3
      .scaleSequential(d3.interpolateOranges)
      .domain([0, data.length - 1]);

    // Add bars
    g.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", (d) => xScale(`${d.percentile}th`) || 0)
      .attr("width", xScale.bandwidth())
      .attr("y", (d) => yScale(d.feeRate))
      .attr("height", (d) => height - yScale(d.feeRate))
      .attr("fill", (d, i) => String(colorScale(i)))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("opacity", 0.8);

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
            `<strong>${d.percentile}th Percentile</strong><br/>` +
              `<strong>Fee Rate:</strong> ${d.feeRate.toFixed(2)} sat/vB`
          )
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 10}px`);

        tooltip.transition().duration(200).style("opacity", 1);
      })
      .on("mouseout", function () {
        d3.selectAll(".tooltip").remove();
        d3.select(this).attr("opacity", 1);
      });

    // Add value labels on bars
    g.selectAll(".label")
      .data(data)
      .enter()
      .append("text")
      .attr("class", "label")
      .attr(
        "x",
        (d) => (xScale(`${d.percentile}th`) || 0) + xScale.bandwidth() / 2
      )
      .attr("y", (d) => yScale(d.feeRate) - 5)
      .attr("text-anchor", "middle")
      .style("fill", "#fff")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .text((d) => d.feeRate.toFixed(1));

    // X Axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
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
      .text("Percentile");
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
        Fee Rate Distribution (Percentiles)
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
