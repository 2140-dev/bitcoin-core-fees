// components/MempoolHealthSummary.tsx
import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MempoolHealthSummary } from '@/lib/api';

interface MempoolHealthSummaryProps {
  summary: MempoolHealthSummary | null;
  loading?: boolean;
}

export default function MempoolHealthSummaryComponent({ summary, loading }: MempoolHealthSummaryProps) {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#cc7400]" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center text-gray-400 py-8">
        No mempool health data available.
      </div>
    );
  }

  const stats = [
    {
      label: 'Overpaid Blocks',
      value: summary.overpaid.count,
      percent: summary.overpaid.percent,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      icon: TrendingUp,
      description: 'Blocks where avg fee > 75th percentile'
    },
    {
      label: 'Within Range',
      value: summary.within.count,
      percent: summary.within.percent,
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      icon: Minus,
      description: 'Blocks with fees in 25th-75th percentile'
    },
    {
      label: 'Underpaid Blocks',
      value: summary.underpaid.count,
      percent: summary.underpaid.percent,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      icon: TrendingDown,
      description: 'Blocks where avg fee < 25th percentile'
    }
  ];

  const totalBlocks = summary.overpaid.count + summary.underpaid.count + summary.within.count;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">
          Mempool Health Summary
        </h2>
        <p className="text-gray-400 text-sm">
          Block fee distribution analysis over the last {totalBlocks} blocks
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`${stat.bgColor} ${stat.borderColor} border rounded-2xl p-5 shadow-xl transition-all duration-300 hover:scale-105`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-lg ${stat.bgColor} border ${stat.borderColor}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div className={`text-right ${stat.color}`}>
                  <div className="text-2xl font-bold">{stat.percent}%</div>
                  <div className="text-xs text-gray-400 mt-0.5">of blocks</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-white">
                  {stat.label}
                </h3>
                <p className="text-xs text-gray-400">
                  {stat.description}
                </p>
                <div className="pt-2 border-t border-gray-700/50">
                  <span className="text-xl font-bold text-white">{stat.value}</span>
                  <span className="text-gray-400 text-sm ml-2">blocks</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 w-full bg-gray-700/30 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full ${stat.color.replace('text', 'bg')} transition-all duration-500`}
                  style={{ width: `${stat.percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Visual Distribution Bar */}
      <div className="bg-[#0b1324] border border-[#1f2a3a] rounded-2xl p-5 shadow-xl">
        <h3 className="text-base font-semibold text-white mb-3">
          Distribution Overview
        </h3>
        <div className="flex w-full h-10 rounded-lg overflow-hidden shadow-inner">
          <div 
            className="bg-red-500 flex items-center justify-center text-white font-semibold text-xs transition-all duration-500 hover:brightness-110"
            style={{ width: `${summary.overpaid.percent}%` }}
          >
            {summary.overpaid.percent > 10 && `${summary.overpaid.percent}%`}
          </div>
          <div 
            className="bg-green-500 flex items-center justify-center text-white font-semibold text-xs transition-all duration-500 hover:brightness-110"
            style={{ width: `${summary.within.percent}%` }}
          >
            {summary.within.percent > 10 && `${summary.within.percent}%`}
          </div>
          <div 
            className="bg-blue-500 flex items-center justify-center text-white font-semibold text-xs transition-all duration-500 hover:brightness-110"
            style={{ width: `${summary.underpaid.percent}%` }}
          >
            {summary.underpaid.percent > 10 && `${summary.underpaid.percent}%`}
          </div>
        </div>
        
        <div className="flex justify-between mt-3 text-xs text-gray-400">
          <span>Overpaid</span>
          <span>Within Range</span>
          <span>Underpaid</span>
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-[#0f172a]/50 border border-[#1f2937]/50 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <div className="text-blue-400 mt-0.5 text-lg">ℹ️</div>
          <div className="text-xs text-gray-300">
            <p className="font-medium mb-1.5">About these metrics:</p>
            <ul className="space-y-1 text-gray-400">
              <li>• <strong className="text-gray-300">Overpaid:</strong> Blocks where the average fee exceeded the 75th percentile</li>
              <li>• <strong className="text-gray-300">Within Range:</strong> Blocks where fees were between the 25th-75th percentile</li>
              <li>• <strong className="text-gray-300">Underpaid:</strong> Blocks where the average fee was below the 25th percentile</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}