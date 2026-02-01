
import React, { useState, useCallback, useEffect } from 'react';
import { 
  FileUp, 
  FileSpreadsheet, 
  FileText, 
  Trash2, 
  Calculator,
  Receipt,
  Download,
  ShieldCheck,
  Database,
  BarChart3,
  Building2,
  Files,
  Wallet,
  Landmark,
  Zap,
  CheckCircle2,
  CreditCard,
  Lock,
  X,
  Loader2
} from 'lucide-react';
import { NfseData } from './types.ts';
import { parseNfseXml } from './utils/xmlHelper.ts';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';

const STORAGE_KEY = 'nfse_reporter_data_v2';
const PREMIUM_KEY = 'nfse_user_premium';
const FREE_LIMIT = 3;

const App: React.FC = () => {
  const [invoices, setInvoices] = useState<NfseData[]>(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [isPremium, setIsPremium] = useState<boolean>(() => {
    return localStorage.getItem(PREMIUM_KEY) === 'true';
  });

  const [showPricing, setShowPricing] = useState(false);
  const [showCheckout, setShowCheckout] = useState<{plan: string, price: string} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(PREMIUM_KEY, String(isPremium));
  }, [isPremium]);

  const processFiles = useCallback(async (files: FileList) => {
    setIsProcessing(true);
    const newInvoices: NfseData[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === 'text/xml' || file.name.toLowerCase().endsWith('.xml')) {
          const text = await file.text();
          const parsed = parseNfseXml(text);
          newInvoices.push(...parsed);
        } else if (file.name.toLowerCase().endsWith('.zip')) {
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);
          for (const filename of Object.keys(contents.files)) {
            if (filename.toLowerCase().endsWith('.xml')) {
              const xmlText = await contents.files[filename].async('text');
              const parsed = parseNfseXml(xmlText);
              newInvoices.push(...parsed);
            }
          }
        }
      }
      
      const totalAfterImport = invoices.length + newInvoices.length;

      if (!isPremium && totalAfterImport > FREE_LIMIT) {
        setShowPricing(true);
        setIsProcessing(false);
        return;
      }

      setInvoices(prev => {
        const combined = [...prev, ...newInvoices];
        return combined.filter((inv, index, self) =>
          index === self.findIndex((t) => (
            t.numero === inv.numero && t.prestadorCnpj === inv.prestadorCnpj
          ))
        );
      });
    } catch (err) {
      console.error("Erro ao processar arquivos", err);
    } finally {
      setIsProcessing(false);
    }
  }, [invoices, isPremium]);

  const handleSimulatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentLoading(true);
    // Simula processamento de cartão de crédito
    setTimeout(() => {
      setIsPremium(true);
      setPaymentLoading(false);
      setShowCheckout(null);
      setShowPricing(false);
      alert("Pagamento aprovado! Agora você tem acesso ilimitado.");
    }, 2000);
  };

  const clearData = () => {
    if (window.confirm("Deseja realmente limpar todos os dados? Esta ação não pode ser desfeita.")) {
      setInvoices([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const exportToExcel = () => {
    if (invoices.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(invoices.map(inv => ({
      'Número': inv.numero,
      'Data Emissão': new Date(inv.dataEmissao).toLocaleString('pt-BR'),
      'Valor Total': inv.valorServicos,
      'ISS': inv.valorIss,
      'Retido': inv.issRetido === 1 ? 'Sim' : 'Não',
      'Tomador': inv.tomadorRazaoSocial
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Notas");
    XLSX.writeFile(workbook, `Relatorio_Fiscal_${new Date().getTime()}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l');
    autoTable(doc, {
      head: [['Nº', 'Data', 'Valor (R$)', 'ISS (R$)', 'Tomador']],
      body: invoices.map(inv => [inv.numero, new Date(inv.dataEmissao).toLocaleDateString('pt-BR'), inv.valorServicos.toFixed(2), inv.valorIss.toFixed(2), inv.tomadorRazaoSocial])
    });
    doc.save('Relatorio_Fiscal.pdf');
  };

  const totals = {
    servicos: invoices.reduce((a, b) => a + b.valorServicos, 0),
    liquido: invoices.reduce((a, b) => a + b.valorLiquidoNfse, 0),
    csll: invoices.reduce((a, b) => a + b.valorCsll, 0),
    tributos: invoices.reduce((a, b) => a + b.valTotTributos, 0),
    issRetido: invoices.reduce((acc, inv) => inv.issRetido === 1 ? acc + inv.valorIss : acc, 0),
    issNaoRetido: invoices.reduce((acc, inv) => inv.issRetido === 2 ? acc + inv.valorIss : acc, 0)
  };

  const uniqueProviders = Array.from(new Set(invoices.map(inv => inv.prestadorRazaoSocial))).filter(Boolean);
  const providerLabel = uniqueProviders.length > 0 ? uniqueProviders.join(', ') : 'Empresa não identificada';

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 max-w-7xl mx-auto space-y-6 relative">
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg shadow-blue-200">
            <Receipt className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">Relatório Fiscal</h1>
              {isPremium ? (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-amber-500" /> PREMIUM
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  FREE ({invoices.length}/{FREE_LIMIT})
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-slate-700 truncate max-w-[300px]">{providerLabel}</span>
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {!isPremium && (
             <button onClick={() => setShowPricing(true)} className="px-4 py-2 bg-amber-500 text-white hover:bg-amber-600 rounded-xl shadow-md flex items-center gap-2 font-bold transition-all transform hover:scale-105">
                <Zap className="w-4 h-4 fill-white" /> Upgrade
             </button>
          )}
          {invoices.length > 0 && (
            <>
              <button onClick={clearData} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                <Trash2 className="w-5 h-5" />
              </button>
              <button onClick={exportToExcel} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow-md flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <button onClick={exportToPDF} className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-900 rounded-xl shadow-md flex items-center gap-2">
                <FileText className="w-4 h-4" /> PDF
              </button>
            </>
          )}
        </div>
      </header>

      {/* CARDS DE RESUMO */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <StatCard title="Total Bruto" value={totals.servicos} icon={<Calculator className="w-5 h-5" />} color="blue" />
          <StatCard title="Tot. Trib (XML)" value={totals.tributos} icon={<BarChart3 className="w-5 h-5" />} color="purple" />
          <StatCard title="CSLL Retido" value={totals.csll} icon={<ShieldCheck className="w-5 h-5" />} color="rose" />
          <StatCard title="ISS Retido" value={totals.issRetido} icon={<Landmark className="w-5 h-5" />} color="indigo" />
          <StatCard title="ISS Não Retido" value={totals.issNaoRetido} icon={<Wallet className="w-5 h-5" />} color="orange" />
          <StatCard title="Total Líquido" value={totals.liquido} icon={<Download className="w-5 h-5" />} color="emerald" />
        </div>
      )}

      {/* ÁREA DE IMPORTAÇÃO OU TABELA */}
      {invoices.length === 0 ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
          className={`border-4 border-dashed rounded-3xl p-16 text-center transition-all cursor-pointer bg-white ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200'} ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input type="file" multiple accept=".xml,.zip" onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" id="xml-upload" />
          <label htmlFor="xml-upload" className="cursor-pointer space-y-4 block">
            {isProcessing ? (
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
            ) : (
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                <FileUp className="w-8 h-8 text-blue-600" />
              </div>
            )}
            <h2 className="text-xl font-bold text-slate-700">{isProcessing ? 'Processando XMLs...' : 'Importar XMLs de Serviço'}</h2>
            <p className="text-slate-500">Arraste seus arquivos ou clique aqui. Limite de {FREE_LIMIT} notas no plano gratuito.</p>
          </label>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[1200px]">
              <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">Nota / Data</th>
                  <th className="px-6 py-4">Tomador</th>
                  <th className="px-6 py-4 text-right">V. Bruto (R$)</th>
                  <th className="px-6 py-4 text-center">ISS (Retenção)</th>
                  <th className="px-6 py-4 text-center">Tributos Federais</th>
                  <th className="px-6 py-4 text-right">V. Líquido (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-900 block text-sm">№ {inv.numero}</span>
                      <span className="text-[10px] text-slate-400">{new Date(inv.dataEmissao).toLocaleDateString('pt-BR')}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold text-slate-700 block truncate max-w-[200px]">{inv.tomadorRazaoSocial || 'Não Informado'}</span>
                      <span className="text-[10px] text-slate-400">{inv.tomadorCpfCnpj || 'Sem Documento'}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800">
                      {inv.valorServicos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded inline-block mb-1 ${inv.issRetido === 1 ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}>
                        ISS {inv.issRetido === 1 ? 'RETIDO' : 'NÃO RETIDO'}
                      </span>
                      <div className="text-[11px] font-bold">R$ {inv.valorIss.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-3 text-[10px] text-slate-500 font-medium">
                        <span>CSLL: <b className="text-rose-600">{inv.valorCsll.toFixed(2)}</b></span>
                        <span>IR: <b className="text-orange-600">{inv.valorIr.toFixed(2)}</b></span>
                        <span>INSS: <b>{inv.valorInss.toFixed(2)}</b></span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-blue-600">
                      {inv.valorLiquidoNfse.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE PREÇOS */}
      {showPricing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden relative animate-in zoom-in-95 duration-300">
            <button onClick={() => setShowPricing(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
              <X className="w-6 h-6" />
            </button>

            <div className="p-8 text-center bg-slate-50 border-b border-slate-100">
              <div className="bg-amber-100 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-amber-600 fill-amber-500" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-800">Limite de Notas Atingido</h2>
              <p className="text-slate-500 mt-2">O plano gratuito permite até {FREE_LIMIT} notas fiscais. Assine para continuar escalando.</p>
            </div>

            <div className="p-8 grid md:grid-cols-2 gap-6">
              {/* PLANO MENSAL */}
              <div className="border-2 border-slate-100 rounded-2xl p-6 hover:border-blue-500 transition-all group flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Plano Mensal</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">R$ 19,90</span>
                    <span className="text-slate-500 text-sm font-medium">/mês</span>
                  </div>
                  <ul className="mt-6 space-y-3">
                    <PricingFeature text="Notas ilimitadas" />
                    <PricingFeature text="Exportação PDF e Excel" />
                    <PricingFeature text="Suporte ao novo IBS/CBS" />
                  </ul>
                </div>
                <button onClick={() => setShowCheckout({plan: 'Mensal', price: '19,90'})} className="mt-8 w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors">
                  Assinar Mensal
                </button>
              </div>

              {/* PLANO ANUAL */}
              <div className="border-2 border-blue-100 bg-blue-50/30 rounded-2xl p-6 relative flex flex-col justify-between">
                <div className="absolute -top-3 right-6 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">
                  Melhor Valor
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Plano Anual</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">R$ 200,00</span>
                    <span className="text-slate-500 text-sm font-medium">/ano</span>
                  </div>
                  <p className="text-xs text-blue-600 font-bold mt-1">Economia de R$ 38,80 ao ano</p>
                  <ul className="mt-6 space-y-3">
                    <PricingFeature text="Notas ilimitadas" />
                    <PricingFeature text="Exportação PDF e Excel" />
                    <PricingFeature text="Suporte prioritário" />
                    <PricingFeature text="Acesso antecipado a novos recursos" />
                  </ul>
                </div>
                <button onClick={() => setShowCheckout({plan: 'Anual', price: '200,00'})} className="mt-8 w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all transform hover:scale-[1.02]">
                  Assinar Anual
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CHECKOUT (CARTÃO DE CRÉDITO) */}
      {showCheckout && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Pagamento Seguro</h2>
                <p className="text-xs text-slate-500">Plano {showCheckout.plan} - R$ {showCheckout.price}</p>
              </div>
              <button onClick={() => setShowCheckout(null)} className="p-2 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSimulatePayment} className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center gap-3 text-blue-700 mb-2">
                <CreditCard className="w-5 h-5" />
                <span className="text-xs font-bold uppercase">Cartão de Crédito</span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nome no Cartão</label>
                <input required type="text" placeholder="JOÃO A SILVA" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Número do Cartão</label>
                <div className="relative">
                  <input required type="text" maxLength={16} placeholder="0000 0000 0000 0000" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  <div className="absolute right-3 top-2.5">
                    <Lock className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Vencimento</label>
                  <input required type="text" placeholder="MM/AA" maxLength={5} className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-center" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">CVV</label>
                  <input required type="password" placeholder="***" maxLength={3} className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-center" />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={paymentLoading}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-blue-200 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-70"
              >
                {paymentLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>Pagar R$ {showCheckout.price}</>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-slate-400">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase">Pagamento Criptografado</span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const PricingFeature = ({ text }: { text: string }) => (
  <li className="flex items-center gap-2 text-sm text-slate-600">
    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
    <span>{text}</span>
  </li>
);

const StatCard = ({ title, value, icon, color }: { title: string, value: number, icon: React.ReactNode, color: string }) => {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    rose: 'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-3">
      <div className={`p-2.5 rounded-xl ${colors[color]}`}>{icon}</div>
      <div className="overflow-hidden">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{title}</p>
        <h4 className="text-base font-bold text-slate-800 mt-0.5 whitespace-nowrap">
          {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </h4>
      </div>
    </div>
  );
};

export default App;
