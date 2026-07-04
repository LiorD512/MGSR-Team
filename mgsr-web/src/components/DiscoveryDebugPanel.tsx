'use client';

import { useState, useEffect } from 'react';
import { getDiscoveryMetrics, getNoveltyTrend, exportAnalytics } from '@/lib/discoveryAnalytics';
import { getSessionDiversity, getSessionId } from '@/lib/sessionDiversityTracker';
import { detectPatternLooping, getAlternativeSuggestion } from '@/lib/searchPatternBreaker';
import { generateRandomDeepDive, formatDeepDiveQuery } from '@/lib/randomDeepDive';

interface Props {
  visible?: boolean;
}

export function DiscoveryDebugPanel({ visible = false }: Props) {
  const [isOpen, setIsOpen] = useState(visible);
  const [metrics, setMetrics] = useState<any>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [pattern, setPattern] = useState<any>(null);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(getDiscoveryMetrics());
      setSessionInfo({
        diversity: getSessionDiversity(),
        trend: getNoveltyTrend(),
      });
      setPattern(detectPatternLooping());
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 px-3 py-2 rounded-lg bg-gray-800 text-white text-xs hover:bg-gray-700 z-50"
        title="Toggle Discovery Debug Panel"
      >
        🔍 Discovery Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 rounded-lg bg-gray-900 text-white text-xs shadow-2xl border border-gray-700 overflow-auto z-50">
      <div className="sticky top-0 bg-gray-800 px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <span className="font-semibold">🔍 Discovery Metrics</span>
        <button
          onClick={() => setIsOpen(false)}
          className="hover:bg-gray-700 px-2 py-1 rounded"
        >
          ✕
        </button>
      </div>

      <div className="p-3 space-y-2">
        {/* Novelty & Diversity */}
        <div className="bg-gray-800 rounded p-2">
          <div className="font-semibold mb-1">📊 Novelty Metrics</div>
          {metrics && (
            <>
              <div className="flex justify-between">
                <span>Novel Results Ratio:</span>
                <span className="text-green-400">{(metrics.noveltyRatio * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Diversity:</span>
                <span className={metrics.averageDiversity > 0.7 ? 'text-green-400' : 'text-yellow-400'}>
                  {(metrics.averageDiversity * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Unique Players (50 searches):</span>
                <span className="text-cyan-400">{metrics.uniquePlayersLast50}</span>
              </div>
              <div className="flex justify-between">
                <span>Search Count:</span>
                <span className="text-purple-400">{metrics.searchCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Repetition Trend:</span>
                <span className={metrics.repetitionTrend.includes('improving') ? 'text-green-400' : 'text-yellow-400'}>
                  {metrics.repetitionTrend}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Session Info */}
        <div className="bg-gray-800 rounded p-2">
          <div className="font-semibold mb-1">📍 Session Info</div>
          {sessionInfo && (
            <>
              <div className="flex justify-between">
                <span>Session Diversity:</span>
                <span className={sessionInfo.diversity > 0.7 ? 'text-green-400' : 'text-yellow-400'}>
                  {(sessionInfo.diversity * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Trend:</span>
                <span>{sessionInfo.trend}</span>
              </div>
            </>
          )}
        </div>

        {/* Pattern Detection */}
        <div className="bg-gray-800 rounded p-2">
          <div className="font-semibold mb-1">🔄 Pattern Analysis</div>
          {pattern && (
            <>
              <div className="flex justify-between">
                <span>Looping Detected:</span>
                <span className={pattern.looping ? 'text-red-400' : 'text-green-400'}>
                  {pattern.looping ? 'YES ⚠️' : 'NO ✓'}
                </span>
              </div>
              {pattern.looping && (
                <>
                  <div className="flex justify-between">
                    <span>Pattern Type:</span>
                    <span className="text-red-300">{pattern.pattern}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Suggestion:</span>
                    <span className="text-blue-300">{pattern.suggestion}</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="bg-gray-800 rounded p-2">
          <div className="font-semibold mb-1">⚙️ Quick Actions</div>
          <button
            onClick={() => {
              const data = exportAnalytics();
              console.log('Analytics Export:', JSON.stringify(data, null, 2));
              alert('Analytics exported to console');
            }}
            className="w-full mb-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
          >
            📥 Export Analytics
          </button>
          <button
            onClick={() => {
              const dive = generateRandomDeepDive();
              alert(`Theme: ${dive.theme}\n${formatDeepDiveQuery(dive.query)}`);
            }}
            className="w-full px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs"
          >
            🎲 Random Deep Dive
          </button>
        </div>

        {/* Footer */}
        <div className="text-gray-500 text-xs border-t border-gray-700 pt-2 mt-2">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
