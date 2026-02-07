
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
  AlertCircle,
  ExternalLink,
  Globe,
  Briefcase
} from 'lucide-react';
import { NfseData } from './types.ts';
import { parseNfseXml } from './utils/xmlHelper.ts';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STORAGE_KEY = 'nfse_reporter_data_v10';
const PREMIUM_KEY = 'nfse_user_premium_v10';
const USAGE_COUNT_KEY = 'nfse_total_usage_count_v10';
const FREE_LIMIT = 5;

const MENSAL_LINK = "https://www.mercadopago.com.br/payment-link/v1/redirect?link-id=e9c92cd6-3936-4bba-a645-8ba89374930b&source=link";
const ANUAL_LINK = "https://www.mercadopago.com.br/payment-link/v1/redirect?link-id=302d2f52-4776-4b7b-8409-2961dc34015b&source=link";

const App: React.FC = () => {
  const [invoices, setInvoices] = useState<NfseData[]>(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    return savedData ? JSON.parse(savedData) : [];
  });

  const [isPremium, setIsPremium] = useState<boolean>(() => {
    return localStorage.getItem(PREMIUM_KEY) === 'true';
  });

  const [totalUsageCount, setTotalUsageCount] = useState<number>(() => {
    return Number(localStorage.getItem(USAGE_COUNT_KEY) || 0);
  });

  const [showPricing, setShowPricing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importType, setImportType] = useState<'giss' | 'nacional'>('giss');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(PREMIUM_KEY, String(isPremium));
  }, [isPremium]);

  useEffect(() => {
    localStorage.setItem(USAGE_COUNT_KEY, String(totalUsageCount));
  }, [totalUsageCount]);

  const companyName = useMemo(() => {
    if (invoices.length > 0 && invoices[0].prestadorRazaoSocial) {
      return invoices[0].prestadorRazaoSocial;
    }
    return "Relatórios NFSe";
  }, [invoices]);

  const reportPeriod = useMemo(() => {
    if (invoices.length === 0) return "";
    const dates = invoices.map(inv => new Date(inv.dataEmissao)).filter(d => !isNaN(d.getTime()));
    if (dates.length === 0) return "";
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
    if (!isPremium && totalUsageCount >= FREE_LIMIT) {
      setShowPricing(true);
      return;
    }

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
      
      const filteredNew = newInvoices.filter(newInv => 
        !invoices.some(existing => existing.numero === newInv.numero && existing.prestadorCnpj === newInv.prestadorCnpj)
      );

      if (!isPremium && (totalUsageCount + filteredNew.length) > FREE_LIMIT) {
        setShowPricing(true);
        setIsProcessing(false);
        return;
      }

      setInvoices(prev => [...prev, ...filteredNew]);
      setTotalUsageCount(prev => prev + filteredNew.length);

    } catch (err) {
      console.error("Erro no processamento:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [invoices, isPremium, totalUsageCount]);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const exportToExcel = () => {
    if (invoices.length === 0) return;
    const dataRows = invoices.map(inv => ({
      'Prestador': inv.prestadorRazaoSocial,
      'Numero NFSe': inv.numero,
      'Data Emissao': new Date(inv.dataEmissao).toLocaleDateString('pt-BR'),
      'Tomador': inv.tomadorRazaoSocial,
      'CNPJ/CPF Tomador': inv.tomadorCpfCnpj,
      'Descricao do Servico': inv.discriminacao,
      'Valor Bruto (R$)': inv.valorServicos,
      'PIS (R$)': inv.valorPis,
      'COFINS (R$)': inv.valorCofins,
      'CSLL (R$)': inv.valorCsll,
      'ISS Retido': inv.issRetido === 1 ? 'Sim' : 'Não',
      'Valor Liquido (R$)': inv.valorLiquidoNfse
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatorio");
    XLSX.writeFile(workbook, `Relatorio_Fiscal_${companyName.replace(/\s/g, '_')}.xlsx`);
  };

  const exportToPDF = () => {
    if (invoices.length === 0) return;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFontSize(16);
    doc.text('Relatório Fiscal de Serviços (NFSe)', 14, 15);
    doc.setFontSize(10);
    doc.text(`Empresa: ${companyName}`, 14, 22);
    doc.text(reportPeriod, 14, 27);

    autoTable(doc, {
      startY: 35,
      head: [['Número', 'Data', 'Prestador', 'Tomador', 'Bruto', 'PIS', 'COFINS', 'CSLL', 'Retido', 'Líquido']],
      body: invoices.map(inv => [
        inv.numero, 
        new Date(inv.dataEmissao).toLocaleDateString('pt-BR'),
        inv.prestadorRazaoSocial.substring(0, 20),
        inv.tomadorRazaoSocial.substring(0, 20),
        formatCurrency(inv.valorServicos),
        formatCurrency(inv.valorPis),
        formatCurrency(inv.valorCofins),
        formatCurrency(inv.valorCsll),
        inv.issRetido === 1 ? 'Sim' : 'Não',
        formatCurrency(inv.valorLiquidoNfse)
      ]),
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8 },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        9: { halign: 'right' },
      }
    });
    
    doc.save(`Relatorio_Fiscal_${companyName.replace(/\s/g, '_')}.pdf`);
  };

  const handleClear = () => {
    if (confirm("Deseja limpar o relatório atual? O limite de uso gratuito não será reiniciado.")) {
      setInvoices([]);
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
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPremium ? 'bg-emerald-100 text-emerald-700' : totalUsageCount >= FREE_LIMIT ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                {isPremium ? 'Plano Premium' : totalUsageCount >= FREE_LIMIT ? 'Teste Esgotado' : `Teste (${totalUsageCount}/${FREE_LIMIT})`}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-center gap-3">
          {!isPremium && (
             <button 
                onClick={() => setShowPricing(true)} 
                className={`px-5 py-2.5 bg-gradient-to-r ${totalUsageCount >= FREE_LIMIT ? 'from-red-500 to-orange-600' : 'from-amber-500 to-orange-500'} text-white hover:opacity-90 rounded-xl shadow-md flex items-center gap-2 font-bold text-xs uppercase tracking-wider transition-all hover:scale-[1.05] active:scale-95 animate-pulse hover:animate-none`}
             >
                <Zap className="w-4 h-4 fill-white" /> {totalUsageCount >= FREE_LIMIT ? 'Renovar Acesso' : 'Upgrade Ilimitado'}
             </button>
          )}
          {invoices.length > 0 && (
            <>
              <button onClick={exportToPDF} className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-sm flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02]">
                <FileText className="w-4 h-4" /> PDF
              </button>
              <button onClick={exportToExcel} className="px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow-sm flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02]">
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <button 
                onClick={handleClear} 
                className="px-4 py-2.5 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-wider border border-red-100"
              >
                <Trash2 className="w-4 h-4" /> Limpar Relatório
              </button>
            </>
          )}
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO */}
      {invoices.length === 0 ? (
        <div className="space-y-6">
          <div className="flex justify-center gap-4">
             <button 
               onClick={() => setImportType('giss')}
               className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${importType === 'giss' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200'}`}
             >
                Padrão GISS / ABRASF
             </button>
             <button 
               onClick={() => setImportType('nacional')}
               className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${importType === 'nacional' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200'}`}
             >
                Portal Nacional (SPED)
             </button>
          </div>

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
              ) : totalUsageCount >= FREE_LIMIT && !isPremium ? (
                <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-12 h-12 text-red-500" />
                </div>
              ) : (
                <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  {importType === 'giss' ? <Briefcase className="w-10 h-10 text-blue-500" /> : <Globe className="w-10 h-10 text-blue-500" />}
                </div>
              )}
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-slate-800 tracking-tight">
                  {totalUsageCount >= FREE_LIMIT && !isPremium ? 'Limite de Teste Atingido' : `Importar ${importType === 'giss' ? 'XML GISS' : 'XML Portal Nacional'}`}
                </h2>
                <p className="text-slate-500 max-w-md mx-auto font-normal text-base">
                  {totalUsageCount >= FREE_LIMIT && !isPremium 
                    ? 'Você já processou o limite de 5 notas gratuitas. Assine um plano para continuar utilizando.'
                    : `Arraste arquivos ${importType === 'giss' ? 'GISS/ABRASF' : 'Portal Nacional (SPED)'} aqui.`}
                </p>
              </div>
              {!(totalUsageCount >= FREE_LIMIT && !isPremium) ? (
                <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-8 py-3 rounded-full text-sm font-bold shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all">
                  Selecionar Arquivos
                </div>
              ) : (
                <button onClick={() => setShowPricing(true)} className="inline-flex items-center gap-2 bg-red-600 text-white px-8 py-3 rounded-full text-sm font-bold shadow-md hover:bg-red-700 transition-all">
                  Ver Planos de Assinatura
                </button>
              )}
            </label>
          </div>
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
                    <th className="px-8 py-5">Prestador / Documento</th>
                    <th className="px-8 py-5">Discriminação do Serviço</th>
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
                            <span className="font-bold text-slate-700 block text-xs">{inv.prestadorRazaoSocial}</span>
                            <span className="text-[10px] text-slate-400">NF № {inv.numero} - {new Date(inv.dataEmissao).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 max-w-xs overflow-hidden">
                          <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                          <span className="text-slate-500 text-[11px] truncate" title={inv.discriminacao}>
                            {inv.discriminacao}
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

      {/* MODAL PREMIUM COM LINKS DO MERCADO PAGO */}
      {showPricing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-6 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full p-8 md:p-12 relative animate-in zoom-in-95 duration-300 my-auto border border-slate-100">
            <button onClick={() => setShowPricing(false)} className="absolute top-8 right-8 p-2 text-slate-300 hover:text-slate-500 transition-colors bg-slate-50 rounded-full"><X className="w-6 h-6" /></button>
            
            <div className="text-center mb-12">
              <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                 <Zap className="w-8 h-8 text-blue-600 fill-blue-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Limite de Teste Atingido</h2>
              <p className="text-slate-500 mt-4 text-lg max-w-lg mx-auto">Você processou o limite gratuito de {FREE_LIMIT} notas. Escolha um plano para liberar o acesso ilimitado.</p>
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
                 </ul>
                 <a 
                  href={MENSAL_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-lg hover:scale-[1.02]"
                 >
                    <CreditCard className="w-5 h-5" /> Assinar Mensal <ExternalLink className="w-4 h-4" />
                 </a>
              </div>

              {/* PLANO ANUAL - DESTAQUE */}
              <div className="border-2 border-blue-500 rounded-[2rem] p-10 flex flex-col bg-blue-50/20 relative shadow-2xl transform md:scale-105 group">
                 <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] shadow-lg">Melhor Valor</div>
                 <h3 className="text-2xl font-bold text-slate-800 mb-2">Plano Anual</h3>
                 <p className="text-slate-500 text-sm mb-8">Economia real para seu negócio.</p>
                 <div className="flex items-baseline gap-1 mb-10">
                    <span className="text-2xl font-bold text-slate-400">R$</span>
                    <span className="text-6xl font-black text-blue-600 tracking-tighter">200,00</span>
                    <span className="text-slate-400 font-medium">/ano</span>
                 </div>
                 <ul className="space-y-5 mb-10 flex-grow">
                    <li className="flex items-center gap-3 text-sm font-bold text-slate-700"><Check className="w-5 h-5 text-white bg-blue-600 rounded-full p-1" /> 2 Meses de Bônus Grátis</li>
                    <li className="flex items-center gap-3 text-sm font-bold text-slate-700"><Check className="w-5 h-5 text-white bg-blue-600 rounded-full p-1" /> Prioridade em Novos Recursos</li>
                 </ul>
                 <a 
                  href={ANUAL_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold uppercase text-xs tracking-widest shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3 hover:scale-[1.02]"
                 >
                    <CreditCard className="w-5 h-5" /> Assinar Anual <ExternalLink className="w-4 h-4" />
                 </a>
              </div>
            </div>

            <div className="mt-12 text-center border-t border-slate-100 pt-8">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.25em] flex items-center justify-center gap-4">
                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Mercado Pago Seguro</span>
                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Pagamento Processado na Nuvem</span>
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
