'use client';

import { useState, useEffect } from 'react';
import { generateRefreshRecommendations, getRefreshHint, type RefreshRecommendation } from '@/lib/refreshRecommender';
import { getSessionDiversity, shouldBoostExploration } from '@/lib/sessionDiversityTracker';

interface Props {
  onApplyRecommendation?: (suggestion: RefreshRecommendation) => void;
  compact?: boolean;
}

export function RefreshRecommendations({ onApplyRecommendation, compact = false }: Props) {
  const [recommendations, setRecommendations] = useState<RefreshRecommendation[]>([]);
  const [hint, setHint] = useState('');
  const [diversity, setDiversity] = useState(0.8);

  useEffect(() => {
    const recs = generateRefreshRecommendations();
    setRecommendations(recs);
    setHint(getRefreshHint());
    setDiversity(getSessionDiversity());
  }, []);

  if (compact && recommendations.length === 0) {
    return null;
  }

  const topRec = recommendations[0];

  const getDiversityColor = () => {
    if (diversity > 0.7) return 'text-green-600';
    if (diversity > 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getDiversityLabel = () => {
    if (diversity > 0.7) return 'Good Diversity';
    if (diversity > 0.5) return 'Medium Diversity';
    return 'Low Diversity - Explore More';
  };

  if (compact) {
    return (
      <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-blue-900">{topRec?.title}</div>
            <div className="text-xs text-blue-700 mt-1">{topRec?.description}</div>
          </div>
          {onApplyRecommendation && topRec && (
            <button
              onClick={() => onApplyRecommendation(topRec)}
              className="ml-2 px-2 py-1 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
            >
              Try It
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Discovery Recommendations</h3>
        <div className={`text-sm font-medium ${getDiversityColor()}`}>
          Diversity: {Math.round(diversity * 100)}% - {getDiversityLabel()}
        </div>
      </div>

      {hint && (
        <div className="rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 p-3 border border-purple-200">
          <div className="text-sm text-purple-900 flex items-start gap-2">
            <span className="text-lg">💡</span>
            <span>{hint}</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {recommendations.slice(0, 3).map((rec, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-gray-200 p-3 hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-gray-900">{rec.title}</div>
                <div className="text-sm text-gray-600 mt-1">{rec.description}</div>
                <div className="text-xs text-gray-500 mt-2">Reason: {rec.reason}</div>
              </div>
              {onApplyRecommendation && (
                <button
                  onClick={() => onApplyRecommendation(rec)}
                  className="ml-2 px-3 py-1 rounded text-sm font-medium bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 whitespace-nowrap"
                >
                  Apply
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {shouldBoostExploration() && (
        <div className="rounded-lg bg-amber-50 p-3 border border-amber-200">
          <div className="text-sm text-amber-900">
            <strong>⚠️ Pattern Alert:</strong> Your recent searches show repetition. Try the suggestions above to break
            the loop and discover fresh talent!
          </div>
        </div>
      )}
    </div>
  );
}
