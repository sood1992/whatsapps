import { useEffect, useState } from 'react';
import {
  UsersIcon,
  ChatBubbleLeftRightIcon,
  ShoppingCartIcon,
  CurrencyRupeeIcon,
} from '@heroicons/react/24/outline';
import api from '../lib/api';

interface DashboardData {
  overview: {
    totalCustomers: number;
    optedInCustomers: number;
    optInRate: number;
    todayMessages: number;
    totalOrders: number;
  };
  cartRecovery: {
    totalAbandoned: number;
    recovered: number;
    recoveryRate: number;
    recoveredRevenue: number;
  };
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    sent: number;
    delivered: number;
    read: number;
    createdAt: string;
  }>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await api.get('/api/analytics/dashboard');
      setData(response.data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
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

  const stats = [
    {
      name: 'Total Customers',
      value: data?.overview.totalCustomers || 0,
      subtext: `${data?.overview.optedInCustomers || 0} opted-in`,
      icon: UsersIcon,
      color: 'bg-blue-500',
    },
    {
      name: 'Messages Today',
      value: data?.overview.todayMessages || 0,
      subtext: 'sent today',
      icon: ChatBubbleLeftRightIcon,
      color: 'bg-green-500',
    },
    {
      name: 'Cart Recovery Rate',
      value: `${(data?.cartRecovery.recoveryRate || 0).toFixed(1)}%`,
      subtext: `${data?.cartRecovery.recovered || 0} recovered`,
      icon: ShoppingCartIcon,
      color: 'bg-yellow-500',
    },
    {
      name: 'Revenue Recovered',
      value: `₹${(data?.cartRecovery.recoveredRevenue || 0).toLocaleString()}`,
      subtext: 'from abandoned carts',
      icon: CurrencyRupeeIcon,
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your WhatsApp marketing performance
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6"
          >
            <dt>
              <div className={`absolute rounded-md ${stat.color} p-3`}>
                <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <p className="ml-16 truncate text-sm font-medium text-gray-500">{stat.name}</p>
            </dt>
            <dd className="ml-16 flex items-baseline">
              <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              <p className="ml-2 text-sm text-gray-500">{stat.subtext}</p>
            </dd>
          </div>
        ))}
      </div>

      {/* Recent Campaigns */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Campaigns</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Campaign
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Sent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Delivered
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Read
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.recentCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No campaigns yet. Create your first campaign!
                  </td>
                </tr>
              ) : (
                data?.recentCampaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {campaign.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          campaign.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-800'
                            : campaign.status === 'RUNNING'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {campaign.sent}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {campaign.delivered}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {campaign.read}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a
            href="/campaigns"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <span className="text-3xl">📢</span>
            <span className="mt-2 text-sm font-medium">New Campaign</span>
          </a>
          <a
            href="/customers"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <span className="text-3xl">👥</span>
            <span className="mt-2 text-sm font-medium">Import Customers</span>
          </a>
          <a
            href="/templates"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <span className="text-3xl">📝</span>
            <span className="mt-2 text-sm font-medium">Create Template</span>
          </a>
          <a
            href="/settings"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <span className="text-3xl">⚙️</span>
            <span className="mt-2 text-sm font-medium">Settings</span>
          </a>
        </div>
      </div>
    </div>
  );
}
