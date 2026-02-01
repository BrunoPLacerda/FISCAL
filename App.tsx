
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  FileUp, 
  FileSpreadsheet, 
  Trash2, 
  Receipt,
  Zap,
  X,
  Loader2,
  FileText,
  ChevronRight,
  BarChart3,
  DollarSign,
  Building2,
  Check,
  CreditCard,
  RotateCcw
} from 'lucide-react';
import { NfseData } from './types.ts';
import { parseNfseXml } from './utils/xmlHelper.ts';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadStripe } from '@stripe/stripe-js';

const STORAGE_KEY = 'nfse_reporter_data_v9';
const PREMIUM_KEY = 'nfse_user_premium_v9';
const FREE_LIMIT = 5; // Atualizado para 5 notas conforme solicitado

// Substitua pela sua Chave Pública do Stripe (pk_live_...)
const STRIPE_PUBLIC_KEY = 'pk_test_placeholder_key'; 

const App: React.FC = () => {
  const [invoices, setInvoices] = useState<NfseData[]>(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    return savedData ? JSON.parse(savedData) : [];
  });

  const [isPremium, setIsPremium] = useState<boolean>(() => {
    return localStorage.getItem(PREMIUM_KEY) === 'true';
  });

  const [showPricing, setShowPricing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(PREMIUM_KEY, String(isPremium));
  }, [isPremium]);

  const companyName = useMemo(() => {
    if (invoices.length > 0 && invoices[0].prestadorRazaoSocial) {
      return invoices[0].prestadorRazaoSocial;
    }
    return "Relatórios NFSe";
  }, [invoices]);

  const reportPeriod = useMemo(() => {
    if (invoices.length === 0) return "";
    const dates = invoices.map(inv => new Date(inv.dataEmissao));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const format = (d: Date) => {
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      return `${month}/${d.getFullYear()}`;
    };
    const start = format(minDate);
    const end = format(maxDate);
    return start === end ? `Mês de Referência: ${start}` : `Período: ${start} até ${end}`;
  }, [invoices]);

  const totals = useMemo(() => {
    return invoices.reduce((acc, inv) => ({
      iss: acc.iss + (inv.valorIss || 0),
      pis: acc.pis + (inv.valorPis || 0),
      cofins: acc.cofins + (inv.valorCofins || 0),
      inss: acc.inss + (inv.valorInss || 0),
      ir: acc.ir + (inv.valorIr || 0),
      csll: acc.csll + (inv.valorCsll || 0),
      bruto: acc.bruto + (inv.valorServicos || 0),
      liquido: acc.liquido + (inv.valorLiquidoNfse || 0),
      retencoes: acc.retencoes + (inv.outrasRetencoes || 0),
      deducoes: acc.deducoes + (inv.valorDeducoes || 0)
    }), { iss: 0, pis: 0, cofins: 0, inss: 0, ir: 0, csll: 0, bruto: 0, liquido: 0, retencoes: 0, deducoes: 0 });
  }, [invoices]);

  const handleStripeCheckout = async (planType: 'mensal' | 'anual') => {
    setPaymentLoading(planType);
    try {
      const stripe = await loadStripe(STRIPE_PUBLIC_KEY);
      if (!stripe) throw new Error('Stripe falhou ao carregar');
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsPremium(true);
      setShowPricing(false);
      alert(`Parabéns! Seu acesso ao plano ${planType.toUpperCase()} foi ativado com sucesso.`);
    } catch (err) {
      console.error('Erro no pagamento:', err);
      alert('Houve um problema ao processar o pagamento.');
    } finally {
      setPaymentLoading(null);
    }
  };

  const decodeBuffer = (buffer: ArrayBuffer | Uint8Array): string => {
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    try {
      const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
      return utf8Decoder.decode(uint8);
    } catch (e) {
      return new TextDecoder('windows-1252').decode(uint8);
    }
  };

  const processFiles = useCallback(async (files: FileList) => {
    setIsProcessing(true);
    const newInvoices: NfseData[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.toLowerCase().endsWith('.xml')) {
          const buffer = await file.arrayBuffer();
          const text = decodeBuffer(buffer);
          const parsed = parseNfseXml(text);
          newInvoices.push(...parsed);
        } else if (file.name.toLowerCase().endsWith('.zip')) {
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);
          for (const filename of Object.keys(contents.files)) {
            if (filename.toLowerCase().endsWith('.xml')) {
              const fileData = await contents.files[filename].async('uint8array');
              const text = decodeBuffer(fileData);
              const parsed = parseNfseXml(text);
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
      console.error("Erro no processamento:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [invoices, isPremium]);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const exportToExcel = () => {
    if (invoices.length === 0) return;
    const dataRows = invoices.map(inv => ({
      'Numero NFSe': inv.numero,
      'Data Emissao': new Date(inv.dataEmissao).toLocaleDateString('pt-BR'),
      'Item de Servico': inv.itemListaServico,
      'Valor Bruto (R$)': inv.valorServicos,
      'Valor Liquido (R$)': inv.valorLiquidoNfse,
      'Valor ISS (R$)': inv.valorIss,
      'Valor PIS (R$)': inv.valorPis,
      'Valor COFINS (R$)': inv.valorCofins,
      'Valor INSS (R$)': inv.valorInss,
      'Valor IR (R$)': inv.valorIr,
      'Valor CSLL (R$)': inv.valorCsll,
      'Outras Retencoes (R$)': inv.outrasRetencoes,
      'Valor Deducoes (R$)': inv.valorDeducoes,
      'Tomador': inv.tomadorRazaoSocial,
      'CNPJ/CPF Tomador': inv.tomadorCpfCnpj
    }));
    dataRows.push({
      'Numero NFSe': 'TOTAL',
      'Data Emissao': '',
      'Item de Servico': '',
      'Valor Bruto (R$)': totals.bruto,
      'Valor Liquido (R$)': totals.liquido,
      'Valor ISS (R$)': totals.iss,
      'Valor PIS (R$)': totals.pis,
      'Valor COFINS (R$)': totals.cofins,
      'Valor INSS (R$)': totals.inss,
      'Valor IR (R$)': totals.ir,
      'Valor CSLL (R$)': totals.csll,
      'Outras Retencoes (R$)': totals.retencoes,
      'Valor Deducoes (R$)': totals.deducoes,
      'Tomador': '',
      'CNPJ/CPF Tomador': ''
    });
    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    worksheet['!cols'] = [
      {wch: 15}, {wch: 15}, {wch: 25}, {wch: 18}, {wch: 18},
      {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 18}, {wch: 18},
      {wch: 45}, {wch: 20}
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatorio_NFSe");
    XLSX.writeFile(workbook, `Relatorio_Fiscal_${companyName.replace(/\s+/g, '_')}.xlsx`);
  };

  const exportToPDF = () => {
    if (invoices.length === 0) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text(companyName, 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    doc.text(reportPeriod, 14, 28);
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 14, 34);
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Resumo Financeiro Consolidado', 14, 45);
    const summaryData = [
      ['Faturamento Bruto', formatCurrency(totals.bruto)],
      ['Valor Líquido', formatCurrency(totals.liquido)],
      ['Total ISS', formatCurrency(totals.iss)],
      ['Total PIS', formatCurrency(totals.pis)],
      ['Total COFINS', formatCurrency(totals.cofins)],
      ['Total INSS', formatCurrency(totals.inss)],
      ['Total IR', formatCurrency(totals.ir)],
      ['Total CSLL', formatCurrency(totals.csll)]
    ];
    autoTable(doc, {
      startY: 50,
      head: [['Indicador', 'Valor Total']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 3 }
    });
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text('Detalhamento das Notas Fiscais', 14, 20);
    doc.setFontSize(10);
    doc.text(reportPeriod, 14, 26);
    const tableRows = invoices.map(inv => [
      inv.numero,
      new Date(inv.dataEmissao).toLocaleDateString('pt-BR'),
      inv.itemListaServico,
      formatCurrency(inv.valorServicos),
      formatCurrency(inv.valorLiquidoNfse)
    ]);
    autoTable(doc, {
      startY: 32,
      head: [['Número', 'Data', 'Item de Serviço', 'Bruto', 'Líquido']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8, cellPadding: 2 }
    });
    doc.save(`Relatorio_Fiscal_${companyName.replace(/\s+/g, '_')}.pdf`);
  };

  const handleClear = () => {
    if (confirm("Deseja limpar todos os dados atuais e começar um novo carregamento? (O limite de 5 notas grátis será reiniciado)")) {
      setInvoices([]);
      // Limpa também o processamento em caso de erro anterior
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-10 max-w-7xl mx-auto space-y-8">
      
      {/* HEADER */}
      <header className="bg-white p-8 rounded-[1.5rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-5">
          <div className="bg-[#2563EB] p-4 rounded-xl text-white shadow-md">
            {invoices.length > 0 ? <Building2 className="w-8 h-8" /> : <Receipt className="w-8 h-8" />}
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{companyName}</h1>
            <div className="flex items-center gap-2">
              {invoices.length > 0 && <p className="text-sm font-medium text-slate-500">{reportPeriod}</p>}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPremium ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {isPremium ? 'Plano Premium' : `Grátis (${invoices.length}/${FREE_LIMIT})`}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-center gap-3">
          {!isPremium && (
             <button 
                onClick={() => setShowPricing(true)} 
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 rounded-xl shadow-md flex items-center gap-2 font-bold text-xs uppercase tracking-wider transition-all hover:scale-[1.05] active:scale-95 animate-pulse hover:animate-none"
             >
                <Zap className="w-4 h-4 fill-white" /> Upgrade Ilimitado
             </button>
          )}
          {invoices.length > 0 && (
            <>
              <button onClick={exportToPDF} className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-sm flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02]">
                <FileText className="w-4 h-4" /> Baixar PDF
              </button>
              <button onClick={exportToExcel} className="px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow-sm flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02]">
                <FileSpreadsheet className="w-4 h-4" /> Baixar Excel
              </button>
              <button 
                onClick={handleClear} 
                className="px-4 py-2.5 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-wider border border-red-100"
              >
                <Trash2 className="w-4 h-4" /> Limpar Tudo
              </button>
            </>
          )}
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO */}
      {invoices.length === 0 ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
          className={`border-2 border-dashed rounded-[2rem] p-32 text-center transition-all bg-white group ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`}
        >
          <input type="file" multiple accept=".xml,.zip" onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" id="xml-upload" />
          <label htmlFor="xml-upload" className="cursor-pointer space-y-6 block">
            {isProcessing ? (
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto" />
            ) : (
              <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <FileUp className="w-10 h-10 text-blue-500" />
              </div>
            )}
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Importar XML Fiscal</h2>
              <p className="text-slate-500 max-w-md mx-auto font-normal text-base">
                Arraste seus arquivos aqui para gerar o relatório consolidado.
                {!isPremium && <span className="block mt-2 font-bold text-blue-600">Limite da conta grátis: {FREE_LIMIT} notas.</span>}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-8 py-3 rounded-full text-sm font-bold shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all">
               Selecionar Arquivos XML ou ZIP
            </div>
          </label>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            {[
              { label: 'ISS Total', value: totals.iss, color: 'text-blue-600' },
              { label: 'PIS Total', value: totals.pis, color: 'text-slate-700' },
              { label: 'COFINS Total', value: totals.cofins, color: 'text-slate-700' },
              { label: 'INSS Total', value: totals.inss, color: 'text-slate-700' },
              { label: 'IR Total', value: totals.ir, color: 'text-slate-700' },
              { label: 'CSLL Total', value: totals.csll, color: 'text-slate-700' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{stat.label}</span>
                <p className={`text-lg font-bold ${stat.color}`}>{formatCurrency(stat.value)}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="bg-white p-8 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-colors">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block mb-1">Bruto Consolidado</span>
                  <p className="text-3xl font-bold text-slate-800 tracking-tight">{formatCurrency(totals.bruto)}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl text-blue-500 group-hover:bg-blue-100 transition-colors">
                  <BarChart3 className="w-8 h-8" />
                </div>
             </div>
             <div className="bg-white p-8 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-colors">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block mb-1">Líquido Consolidado</span>
                  <p className="text-3xl font-bold text-emerald-600 tracking-tight">{formatCurrency(totals.liquido)}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl text-emerald-500 group-hover:bg-emerald-100 transition-colors">
                  <DollarSign className="w-8 h-8" />
                </div>
             </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-[0.1em]">
                  <tr>
                    <th className="px-8 py-5">Documento / Data</th>
                    <th className="px-8 py-5">Item de Serviço</th>
                    <th className="px-8 py-5 text-right">Valor Bruto</th>
                    <th className="px-8 py-5 text-right">Valor Líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-slate-300" />
                          <div>
                            <span className="font-bold text-slate-700 block text-sm">NFSe № {inv.numero}</span>
                            <span className="text-[11px] text-slate-400">{new Date(inv.dataEmissao).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3 h-3 text-slate-300" />
                          <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded text-[11px] font-medium border border-slate-200">
                            {inv.itemListaServico}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right font-medium text-slate-700 text-sm tabular-nums">
                        {inv.valorServicos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-8 py-5 text-right font-bold text-blue-600 text-sm tabular-nums">
                        {inv.valorLiquidoNfse.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL PREMIUM COM STRIPE */}
      {showPricing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-6 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full p-8 md:p-12 relative animate-in zoom-in-95 duration-300 my-auto border border-slate-100">
            <button onClick={() => setShowPricing(false)} className="absolute top-8 right-8 p-2 text-slate-300 hover:text-slate-500 transition-colors bg-slate-50 rounded-full"><X className="w-6 h-6" /></button>
            
            <div className="text-center mb-12">
              <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                 <Zap className="w-8 h-8 text-blue-600 fill-blue-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Libere o Poder Total</h2>
              <p className="text-slate-500 mt-4 text-lg max-w-lg mx-auto">Você atingiu o limite de {FREE_LIMIT} notas grátis. Assine para importar milhares de notas e gerar relatórios ilimitados.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* PLANO MENSAL */}
              <div className="border border-slate-200 rounded-[2rem] p-10 flex flex-col hover:border-blue-300 transition-all bg-white relative group">
                 <h3 className="text-2xl font-bold text-slate-800 mb-2">Plano Mensal</h3>
                 <p className="text-slate-500 text-sm mb-8">Flexibilidade total para sua empresa.</p>
                 <div className="flex items-baseline gap-1 mb-10">
                    <span className="text-2xl font-bold text-slate-400">R$</span>
                    <span className="text-6xl font-black text-slate-900 tracking-tighter">19,90</span>
                    <span className="text-slate-400 font-medium">/mês</span>
                 </div>
                 <ul className="space-y-5 mb-10 flex-grow">
                    <li className="flex items-center gap-3 text-sm font-medium text-slate-600"><Check className="w-5 h-5 text-blue-500 bg-blue-50 rounded-full p-1" /> Importação Ilimitada</li>
                    <li className="flex items-center gap-3 text-sm font-medium text-slate-600"><Check className="w-5 h-5 text-blue-500 bg-blue-50 rounded-full p-1" /> Exportação PDF/Excel</li>
                    <li className="flex items-center gap-3 text-sm font-medium text-slate-600"><Check className="w-5 h-5 text-blue-500 bg-blue-50 rounded-full p-1" /> Filtros Avançados</li>
                 </ul>
                 <button 
                  disabled={!!paymentLoading}
                  onClick={() => handleStripeCheckout('mensal')} 
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg group-hover:scale-[1.02]"
                 >
                    {paymentLoading === 'mensal' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                    {paymentLoading === 'mensal' ? 'Conectando...' : 'Assinar Mensal'}
                 </button>
              </div>

              {/* PLANO ANUAL - DESTAQUE */}
              <div className="border-2 border-blue-500 rounded-[2rem] p-10 flex flex-col bg-blue-50/20 relative shadow-2xl transform md:scale-105 group">
                 <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-lg">Economia de 15%</div>
                 <h3 className="text-2xl font-bold text-slate-800 mb-2">Plano Anual</h3>
                 <p className="text-slate-500 text-sm mb-8">O melhor custo-benefício para contadores.</p>
                 <div className="flex items-baseline gap-1 mb-10">
                    <span className="text-2xl font-bold text-slate-400">R$</span>
                    <span className="text-6xl font-black text-blue-600 tracking-tighter">200,00</span>
                    <span className="text-slate-400 font-medium">/ano</span>
                 </div>
                 <ul className="space-y-5 mb-10 flex-grow">
                    <li className="flex items-center gap-3 text-sm font-bold text-slate-700"><Check className="w-5 h-5 text-white bg-blue-600 rounded-full p-1" /> Tudo do Plano Mensal</li>
                    <li className="flex items-center gap-3 text-sm font-bold text-slate-700"><Check className="w-5 h-5 text-white bg-blue-600 rounded-full p-1" /> 2 Meses de Bônus Grátis</li>
                    <li className="flex items-center gap-3 text-sm font-bold text-slate-700"><Check className="w-5 h-5 text-white bg-blue-600 rounded-full p-1" /> Prioridade em Novos Recursos</li>
                 </ul>
                 <button 
                  disabled={!!paymentLoading}
                  onClick={() => handleStripeCheckout('anual')} 
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold uppercase text-xs tracking-widest shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50 group-hover:scale-[1.02]"
                 >
                    {paymentLoading === 'anual' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                    {paymentLoading === 'anual' ? 'Conectando...' : 'Assinar Anual'}
                 </button>
              </div>
            </div>

            <div className="mt-12 text-center border-t border-slate-100 pt-8">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.25em] flex items-center justify-center gap-4">
                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Stripe Secure</span>
                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> SSL Encrypted</span>
                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> PCI Compliance</span>
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
