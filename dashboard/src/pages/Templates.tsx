import { useEffect, useState } from 'react';
import { PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface Template {
  id: string;
  name: string;
  category: string;
  status: string;
  bodyText: string;
  createdAt: string;
}

interface PrebuiltTemplate {
  name: string;
  category: string;
  components: Array<{ type: string; text?: string }>;
}

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [prebuilt, setPrebuilt] = useState<PrebuiltTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'mine' | 'prebuilt'>('mine');

  useEffect(() => {
    loadTemplates();
    loadPrebuilt();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await api.get('/api/templates');
      setTemplates(response.data.templates);
    } catch (error) {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const loadPrebuilt = async () => {
    try {
      const response = await api.get('/api/templates/prebuilt');
      setPrebuilt(response.data.templates);
    } catch (error) {
      console.error('Failed to load prebuilt templates');
    }
  };

  const syncTemplates = async () => {
    try {
      await api.post('/api/templates/sync');
      toast.success('Templates synced from Meta');
      loadTemplates();
    } catch (error) {
      toast.error('Failed to sync templates');
    }
  };

  const usePrebuilt = async (name: string) => {
    try {
      await api.post(`/api/templates/prebuilt/${name}`);
      toast.success('Template created');
      loadTemplates();
      setTab('mine');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create template');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Message Templates</h2>
          <p className="mt-1 text-sm text-gray-500">
            WhatsApp requires approved templates for business-initiated messages
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncTemplates}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowPathIcon className="-ml-1 mr-2 h-5 w-5" />
            Sync from Meta
          </button>
          <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700">
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            Create Template
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-8">
          <button
            onClick={() => setTab('mine')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              tab === 'mine'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            My Templates ({templates.length})
          </button>
          <button
            onClick={() => setTab('prebuilt')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              tab === 'prebuilt'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Pre-built Templates ({prebuilt.length})
          </button>
        </nav>
      </div>

      {tab === 'mine' ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Template
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No templates yet. Create one or use a pre-built template!
                  </td>
                </tr>
              ) : (
                templates.map((template) => (
                  <tr key={template.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{template.name}</div>
                      <div className="text-sm text-gray-500 truncate max-w-md">
                        {template.bodyText}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {template.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          template.status
                        )}`}
                      >
                        {template.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-primary-600 hover:text-primary-800">Edit</button>
                      {template.status === 'DRAFT' && (
                        <button className="ml-4 text-green-600 hover:text-green-800">
                          Submit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {prebuilt.map((template) => {
            const body = template.components.find((c) => c.type === 'BODY');
            const exists = templates.some((t) => t.name === template.name);

            return (
              <div key={template.name} className="bg-white shadow rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">{template.name}</h3>
                    <span className="inline-flex px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded mt-1">
                      {template.category}
                    </span>
                  </div>
                  {exists ? (
                    <span className="text-xs text-green-600">Added</span>
                  ) : (
                    <button
                      onClick={() => usePrebuilt(template.name)}
                      className="text-sm text-primary-600 hover:text-primary-800"
                    >
                      Use This
                    </button>
                  )}
                </div>
                <p className="mt-3 text-sm text-gray-600 line-clamp-4">{body?.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
