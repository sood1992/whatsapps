import { useEffect, useState } from 'react';
import api from '../lib/api';

interface Stats {
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

interface CartStats {
  stats: {
    totalAbandoned: number;
    recovered: number;
    recoveryRate: number;
    recoveredRevenue: number;
    messagesSent: number;
  };
}

export default function Analytics() {
  const [messageStats, setMessageStats] = useState<Stats | null>(null);
  const [cartStats, setCartStats] = useState<CartStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [messages, carts] = await Promise.all([
        api.get('/api/analytics/messages'),
        api.get('/api/analytics/cart-recovery'),
      ]);
      setMessageStats(messages.data);
      setCartStats(carts.data);
    } catch (error) {
      console.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
        <p className="mt-1 text-sm text-gray-500">Performance metrics for the last 30 days</p>
      </div>

      {/* Message Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Message Status</h3>
          <div className="space-y-4">
            {Object.entries(messageStats?.byStatus || {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{status}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        status === 'READ'
                          ? 'bg-blue-500'
                          : status === 'DELIVERED'
                          ? 'bg-green-500'
                          : status === 'FAILED'
                          ? 'bg-red-500'
                          : 'bg-gray-400'
                      }`}
                      style={{
                        width: `${Math.min(100, (count / 100) * 100)}%`,
                      }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-12 text-right">
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Message Types</h3>
          <div className="space-y-4">
            {Object.entries(messageStats?.byType || {}).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{type}</span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Recovery Stats */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Cart Recovery Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {cartStats?.stats.totalAbandoned || 0}
            </div>
            <div className="text-sm text-gray-500">Abandoned Carts</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {cartStats?.stats.recovered || 0}
            </div>
            <div className="text-sm text-gray-500">Recovered</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {(cartStats?.stats.recoveryRate || 0).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500">Recovery Rate</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              ₹{(cartStats?.stats.recoveredRevenue || 0).toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Revenue Recovered</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {cartStats?.stats.messagesSent || 0}
            </div>
            <div className="text-sm text-gray-500">Recovery Messages</div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-gradient-to-r from-primary-50 to-green-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">💡 Pro Tips</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>• Send cart recovery messages within 30-60 minutes of abandonment for best results</li>
          <li>• Personalize messages with customer name and product images</li>
          <li>• Offer discounts in follow-up messages (10-15% works best)</li>
          <li>• Keep messaging window between 9 AM - 9 PM for higher engagement</li>
          <li>• Test different templates to find what works for your audience</li>
        </ul>
      </div>
    </div>
  );
}
