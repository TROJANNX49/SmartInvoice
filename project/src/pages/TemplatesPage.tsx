import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, InvoiceTemplate } from '../lib/api';
import {
  FileText,
  Plus,
  Palette,
  Trash2,
  Check,
  X,
  Save,
} from 'lucide-react';

const colorPresets = [
  { name: 'Emerald', primary: '#10b981', secondary: '#06b6d4' },
  { name: 'Blue', primary: '#3b82f6', secondary: '#8b5cf6' },
  { name: 'Rose', primary: '#f43f5e', secondary: '#ec4899' },
  { name: 'Amber', primary: '#f59e0b', secondary: '#ef4444' },
  { name: 'Slate', primary: '#475569', secondary: '#64748b' },
  { name: 'Teal', primary: '#14b8a6', secondary: '#0ea5e9' },
];

const defaultTemplateConfig = {
  primaryColor: '#10b981',
  secondaryColor: '#06b6d4',
  fontFamily: 'system-ui',
  showLogo: true,
  logoUrl: '',
  showPaymentInfo: true,
  paymentDetails: '',
  footerText: 'Thank you for your business!',
};

export function TemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTemplateConfig, setNewTemplateConfig] = useState(defaultTemplateConfig);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const data = await api.getTemplates();
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;

    try {
      const data = await api.createTemplate({
        name: newTemplateName,
        template_config: newTemplateConfig,
      });
      setTemplates([data, ...templates]);
      setNewTemplateName('');
      setNewTemplateConfig(defaultTemplateConfig);
      setShowNewForm(false);
    } catch (error) {
      console.error('Error creating template:', error);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.updateTemplate(id, { is_default: true });
      setTemplates(
        templates.map((t) => ({
          ...t,
          is_default: t.id === id,
        }))
      );
    } catch (error) {
      console.error('Error setting default template:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await api.deleteTemplate(id);
      setTemplates(templates.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Invoice Templates</h1>
          <p className="text-slate-400 mt-1">Customize the look of your invoices</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-5 h-5" />
          New Template
        </button>
      </div>

      {showNewForm && (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Create New Template</h2>
            <button
              onClick={() => setShowNewForm(false)}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Template Name
              </label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Professional, Modern, Minimal"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                <Palette className="w-4 h-4 inline mr-2" />
                Color Scheme
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {colorPresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() =>
                      setNewTemplateConfig({
                        ...newTemplateConfig,
                        primaryColor: preset.primary,
                        secondaryColor: preset.secondary,
                      })
                    }
                    className={`p-3 rounded-xl border transition-all ${
                      newTemplateConfig.primaryColor === preset.primary
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex gap-1 mb-2">
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: preset.primary }}
                      />
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: preset.secondary }}
                      />
                    </div>
                    <p className="text-sm text-slate-300">{preset.name}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Footer Text
              </label>
              <input
                type="text"
                value={newTemplateConfig.footerText}
                onChange={(e) =>
                  setNewTemplateConfig({ ...newTemplateConfig, footerText: e.target.value })
                }
                placeholder="Thank you for your business!"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowNewForm(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim()}
                className="inline-flex items-center gap-2 px-6 py-2 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Save className="w-4 h-4" />
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No templates yet</h3>
          <p className="text-slate-400 mb-6">Create your first template to customize invoice appearance</p>
          <button
            onClick={() => setShowNewForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden hover:border-slate-600 transition-all"
            >
              <div className="p-4 flex items-center justify-between border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${template.template_config.primaryColor || '#10b981'}, ${template.template_config.secondaryColor || '#06b6d4'})`,
                    }}
                  >
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{template.name}</p>
                    {template.is_default && (
                      <span className="text-xs text-emerald-400">Default</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!template.is_default && (
                    <button
                      onClick={() => handleSetDefault(template.id)}
                      className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                      title="Set as default"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Delete template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-900/50">
                <div className="rounded-lg overflow-hidden border border-slate-700">
                  <div
                    className="h-8 flex items-center px-3"
                    style={{
                      background: `linear-gradient(90deg, ${template.template_config.primaryColor || '#10b981'}, ${template.template_config.secondaryColor || '#06b6d4'})`,
                    }}
                  >
                    <div className="w-16 h-2 bg-white/30 rounded" />
                  </div>
                  <div className="p-3 bg-white">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="space-y-1">
                        <div className="w-12 h-1.5 bg-gray-300 rounded" />
                        <div className="w-8 h-1 bg-gray-200 rounded" />
                      </div>
                      <div className="space-y-1 text-right">
                        <div className="w-10 h-1.5 bg-gray-300 rounded ml-auto" />
                        <div className="w-8 h-1 bg-gray-200 rounded ml-auto" />
                      </div>
                    </div>
                    <div className="border-t border-gray-200 pt-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex justify-between py-1">
                          <div className="w-16 h-1 bg-gray-200 rounded" />
                          <div className="w-8 h-1 bg-gray-200 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
