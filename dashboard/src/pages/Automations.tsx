import { useEffect, useState } from 'react';
import { Switch } from '@headlessui/react';
import { PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface Rule {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  action: string;
  isActive: boolean;
  timesTriggered: number;
  lastTriggeredAt: string | null;
}

const TRIGGER_LABELS: Record<string, string> = {
  ORDER_CREATED: '📦 New Order',
  ORDER_COMPLETED: '✅ Order Completed',
  ORDER_SHIPPED: '🚚 Order Shipped',
  ORDER_DELIVERED: '🎉 Order Delivered',
  CART_ABANDONED: '🛒 Cart Abandoned',
  CUSTOMER_OPTED_IN: '👋 Customer Opt-In',
  KEYWORD_RECEIVED: '💬 Keyword Received',
  NO_ORDER_DAYS: '⏰ Inactive Customer',
};

const ACTION_LABELS: Record<string, string> = {
  SEND_TEMPLATE: 'Send Template Message',
  SEND_MESSAGE: 'Send Text Message',
  ADD_TAG: 'Add Customer Tag',
  REMOVE_TAG: 'Remove Customer Tag',
  NOTIFY_ADMIN: 'Notify Admin',
};

export default function Automations() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const response = await api.get('/api/automations');
      setRules(response.data.rules);
    } catch (error) {
      toast.error('Failed to load automation rules');
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (id: string) => {
    try {
      await api.post(`/api/automations/${id}/toggle`);
      loadRules();
    } catch (error) {
      toast.error('Failed to toggle rule');
    }
  };

  const setupDefaults = async () => {
    try {
      await api.post('/api/automations/setup-defaults');
      toast.success('Default rules created');
      loadRules();
    } catch (error) {
      toast.error('Failed to setup defaults');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Automations</h2>
          <p className="mt-1 text-sm text-gray-500">
            Automated message triggers and actions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={setupDefaults}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Setup Defaults
          </button>
          <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700">
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            New Rule
          </button>
        </div>
      </div>

      {/* Available Triggers */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Available Triggers</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(TRIGGER_LABELS).map(([key, label]) => (
            <div
              key={key}
              className="p-3 rounded-lg border border-gray-200 text-center text-sm hover:border-primary-500 cursor-pointer"
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Rules List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Active Rules</h3>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No automation rules yet.</p>
            <button
              onClick={setupDefaults}
              className="mt-4 text-primary-600 hover:text-primary-800"
            >
              Setup default rules
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {rules.map((rule) => (
              <li key={rule.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-medium text-gray-900">{rule.name}</h4>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {TRIGGER_LABELS[rule.trigger] || rule.trigger}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {rule.description || ACTION_LABELS[rule.action] || rule.action}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Triggered {rule.timesTriggered} times
                      {rule.lastTriggeredAt &&
                        ` • Last: ${new Date(rule.lastTriggeredAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Switch
                    checked={rule.isActive}
                    onChange={() => toggleRule(rule.id)}
                    className={`${
                      rule.isActive ? 'bg-primary-600' : 'bg-gray-200'
                    } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out`}
                  >
                    <span
                      className={`${
                        rule.isActive ? 'translate-x-5' : 'translate-x-0'
                      } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5 ml-0.5`}
                    />
                  </Switch>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
