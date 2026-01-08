import { useEffect, useState } from 'react';
import { PlusIcon, PlayIcon, PauseIcon, StopIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  totalRecipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  scheduledAt: string | null;
  createdAt: string;
  template: { name: string } | null;
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      const response = await api.get('/api/campaigns');
      setCampaigns(response.data.campaigns);
    } catch (error) {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await api.post(`/api/campaigns/${id}/${action}`);
      toast.success(`Campaign ${action}ed`);
      loadCampaigns();
    } catch (error) {
      toast.error(`Failed to ${action} campaign`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'RUNNING':
        return 'bg-blue-100 text-blue-800';
      case 'SCHEDULED':
        return 'bg-yellow-100 text-yellow-800';
      case 'PAUSED':
        return 'bg-orange-100 text-orange-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campaigns</h2>
          <p className="mt-1 text-sm text-gray-500">Create and manage your broadcast campaigns</p>
        </div>
        <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700">
          <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
          New Campaign
        </button>
      </div>

      {/* Campaign Types */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { type: 'BROADCAST', label: 'Broadcast', icon: '📢', desc: 'One-time message' },
          { type: 'DAILY_OFFER', label: 'Daily Offer', icon: '🌟', desc: 'Recurring daily' },
          { type: 'WEEKLY_OFFER', label: 'Weekly Offer', icon: '📅', desc: 'Recurring weekly' },
          { type: 'REENGAGEMENT', label: 'Win Back', icon: '💌', desc: 'Inactive customers' },
        ].map((item) => (
          <button
            key={item.type}
            className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
          >
            <span className="text-2xl">{item.icon}</span>
            <div className="mt-2 font-medium text-gray-900">{item.label}</div>
            <div className="text-xs text-gray-500">{item.desc}</div>
          </button>
        ))}
      </div>

      {/* Campaigns List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Campaign
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Progress
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Delivery
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No campaigns yet. Create your first campaign!
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{campaign.name}</div>
                    <div className="text-xs text-gray-500">
                      Template: {campaign.template?.name || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {campaign.type.replace('_', ' ')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                        campaign.status
                      )}`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {campaign.sent} / {campaign.totalRecipients}
                    </div>
                    <div className="w-24 bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-primary-600 h-2 rounded-full"
                        style={{
                          width: `${
                            campaign.totalRecipients
                              ? (campaign.sent / campaign.totalRecipients) * 100
                              : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-4">
                      <div>
                        <span className="text-green-600">{campaign.delivered}</span>
                        <span className="text-gray-400 text-xs block">delivered</span>
                      </div>
                      <div>
                        <span className="text-blue-600">{campaign.read}</span>
                        <span className="text-gray-400 text-xs block">read</span>
                      </div>
                      <div>
                        <span className="text-red-600">{campaign.failed}</span>
                        <span className="text-gray-400 text-xs block">failed</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-2">
                      {campaign.status === 'DRAFT' && (
                        <button
                          onClick={() => handleAction(campaign.id, 'start')}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Start"
                        >
                          <PlayIcon className="h-5 w-5" />
                        </button>
                      )}
                      {campaign.status === 'RUNNING' && (
                        <button
                          onClick={() => handleAction(campaign.id, 'pause')}
                          className="p-1 text-yellow-600 hover:bg-yellow-50 rounded"
                          title="Pause"
                        >
                          <PauseIcon className="h-5 w-5" />
                        </button>
                      )}
                      {campaign.status === 'PAUSED' && (
                        <button
                          onClick={() => handleAction(campaign.id, 'resume')}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Resume"
                        >
                          <PlayIcon className="h-5 w-5" />
                        </button>
                      )}
                      {['RUNNING', 'PAUSED', 'SCHEDULED'].includes(campaign.status) && (
                        <button
                          onClick={() => handleAction(campaign.id, 'cancel')}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Cancel"
                        >
                          <StopIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
