
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
  Landmark
} from 'lucide-react';
import { NfseData } from './types.ts';
import { parseNfseXml } from './utils/xmlHelper.ts';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';

const STORAGE_KEY = 'nfse_reporter_data_v2';

const App: React.FC = () => {
  // Inicialização "Lazy" para evitar conflitos de sincronização entre Effects
  const [invoices, setInvoices] = useState<NfseData[]>(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        console.error("Erro ao carregar dados iniciais", e);
        return [];
      }
    }
    return [];
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sincroniza com localStorage apenas quando houver mudanças reais no estado
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  }, [invoices]);

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
  }, []);

  const clearData = () => {
    if (window.confirm("Deseja realmente limpar todos os dados? Esta ação não pode ser desfeita.")) {
      setInvoices([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const exportToExcel = () => {
    if (invoices.length === 0) return;

    const dataRows = invoices.map(inv => ({
      'Número': inv.numero,
      'Data Emissão': new Date(inv.dataEmissao).toLocaleString('pt-BR'),
      'Item Lista Serviço': inv.itemListaServico,
      'Cód. Trib. Município': inv.codigoTributacaoMunicipio,
      'Descrição Cód. Trib. Município': inv.descricaoCodigoTributacaoMunicipio,
      'Valor Total Nota': inv.valorServicos,
      'Valor Líquido': inv.valorLiquidoNfse,
      'ISS': inv.valorIss,
      'ISS Retido': inv.issRetido === 1 ? 'Sim' : 'Não',
      'PIS': inv.valorPis,
      'COFINS': inv.valorCofins,
      'CSLL': inv.valorCsll,
      'IR': inv.valorIr,
      'INSS': inv.valorInss,
      'Total Tributos': inv.valTotTributos,
      'BC PIS/COFINS': inv.vBCPisCofins,
      'BC IBS/CBS (Novo)': inv.vBC_IBSCBS,
      'Tomador': inv.tomadorRazaoSocial,
      'CNPJ Tomador': inv.tomadorCpfCnpj,
      'Prestador': inv.prestadorRazaoSocial
    }));

    const totalRow = {
      'Número': 'TOTAL GERAL',
      'Data Emissão': '',
      'Item Lista Serviço': '',
      'Cód. Trib. Município': '',
      'Descrição Cód. Trib. Município': '',
      'Valor Total Nota': invoices.reduce((a, b) => a + b.valorServicos, 0),
      'Valor Líquido': invoices.reduce((a, b) => a + b.valorLiquidoNfse, 0),
      'ISS': invoices.reduce((a, b) => a + b.valorIss, 0),
      'ISS Retido': '',
      'PIS': invoices.reduce((a, b) => a + b.valorPis, 0),
      'COFINS': invoices.reduce((a, b) => a + b.valorCofins, 0),
      'CSLL': invoices.reduce((a, b) => a + b.valorCsll, 0),
      'IR': invoices.reduce((a, b) => a + b.valorIr, 0),
      'INSS': invoices.reduce((a, b) => a + b.valorInss, 0),
      'Total Tributos': invoices.reduce((a, b) => a + b.valTotTributos, 0),
      'BC PIS/COFINS': invoices.reduce((a, b) => a + b.vBCPisCofins, 0),
      'BC IBS/CBS (Novo)': invoices.reduce((a, b) => a + b.vBC_IBSCBS, 0),
      'Tomador': '',
      'CNPJ Tomador': '',
      'Prestador': ''
    };

    const worksheetData = [...dataRows, totalRow];
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    
    const wscols = [
      {wch: 15}, {wch: 20}, {wch: 18}, {wch: 22}, {wch: 45}, 
      {wch: 18}, {wch: 18}, {wch: 12}, {wch: 12}, {wch: 12}, 
      {wch: 12}, {wch: 12}, {wch: 12}, {wch: 12}, {wch: 15}, 
      {wch: 18}, {wch: 18}, {wch: 35}, {wch: 20}, {wch: 35}
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados NFSe");
    XLSX.writeFile(workbook, `Relatorio_NFSe_Excel_${new Date().getTime()}.xlsx`);
  };

  const exportToPDF = () => {
    if (invoices.length === 0) return;

    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text('Relatório Fiscal NFSe - Detalhado', 14, 15);
    doc.setFontSize(8);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} | Total de Notas: ${invoices.length}`, 14, 20);
    
    const totalServicos = invoices.reduce((a, b) => a + b.valorServicos, 0);
    const totalCsll = invoices.reduce((a, b) => a + b.valorCsll, 0);
    const totalTributos = invoices.reduce((a, b) => a + b.valTotTributos, 0);
    const totalBcIbsCbs = invoices.reduce((a, b) => a + b.vBC_IBSCBS, 0);
    const totalLiquido = invoices.reduce((a, b) => a + b.valorLiquidoNfse, 0);

    const tableData = invoices.map(inv => [
      inv.numero,
      new Date(inv.dataEmissao).toLocaleDateString('pt-BR'),
      inv.valorServicos.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      inv.valorCsll.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      inv.valTotTributos.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      inv.vBC_IBSCBS.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      inv.valorLiquidoNfse.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    ]);

    const footerRow = [
      'TOTAL GERAL',
      '',
      totalServicos.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      totalCsll.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      totalTributos.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      totalBcIbsCbs.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    ];

    autoTable(doc, {
      head: [['Nº', 'Data', 'V. Total (R$)', 'CSLL (R$)', 'Tot. Trib (R$)', 'BC IBS/CBS', 'V. Líquido']],
      body: tableData,
      foot: [footerRow],
      showFoot: 'lastPage',
      startY: 25,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' }
      }
    });

    doc.save(`Relatorio_NFSe_Completo_${new Date().getTime()}.pdf`);
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
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg shadow-blue-200">
            <Receipt className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">Relatório Fiscal</h1>
              {invoices.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Files className="w-3 h-3" /> {invoices.length} {invoices.length === 1 ? 'Nota' : 'Notas'}
                </span>
              )}
            </div>
            {invoices.length > 0 ? (
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-slate-700">{providerLabel}</span>
              </p>
            ) : (
              <p className="text-sm text-slate-500 flex items-center gap-1">
                <Database className="w-3 h-3 text-emerald-500" />
                Suporte ao novo padrão de tributos (IBS/CBS)
              </p>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          {invoices.length > 0 && (
            <>
              <button onClick={clearData} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-medium flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Limpar
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

      {invoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <StatCard title="Total Bruto" value={totals.servicos} icon={<Calculator className="w-5 h-5" />} color="blue" />
          <StatCard title="Tot. Trib (XML)" value={totals.tributos} icon={<BarChart3 className="w-5 h-5" />} color="purple" />
          <StatCard title="CSLL Retido" value={totals.csll} icon={<ShieldCheck className="w-5 h-5" />} color="rose" />
          <StatCard title="ISS Retido (1)" value={totals.issRetido} icon={<Landmark className="w-5 h-5" />} color="indigo" />
          <StatCard title="ISS Não Retido (2)" value={totals.issNaoRetido} icon={<Wallet className="w-5 h-5" />} color="orange" />
          <StatCard title="Total Líquido" value={totals.liquido} icon={<Download className="w-5 h-5" />} color="emerald" />
        </div>
      )}

      {invoices.length === 0 ? (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(e.dataTransfer.files) processFiles(e.dataTransfer.files); }}
          className={`border-4 border-dashed rounded-3xl p-16 text-center transition-all cursor-pointer bg-white ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
        >
          <input type="file" multiple accept=".xml,.zip" onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" id="xml-upload" />
          <label htmlFor="xml-upload" className="cursor-pointer space-y-4 block">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
              <FileUp className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-700">Importar XMLs de Serviço</h2>
            <p className="text-slate-500">Arraste seus arquivos ou clique aqui. Suporta o novo padrão GISSV2 e Reforma Tributária.</p>
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
                  <th className="px-6 py-4 text-center">CSLL / IR / Federais</th>
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
                      <div className="flex flex-col items-center">
                         <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${inv.issRetido === 1 ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}>
                           ISS {inv.issRetido === 1 ? 'RETIDO' : 'NÃO RETIDO'}
                         </span>
                         <span className="text-[11px] font-bold mt-1">R$ {inv.valorIss.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="grid grid-cols-2 gap-x-4 text-[10px] text-slate-500 w-fit mx-auto">
                        <span>CSLL: <b className="text-rose-600">{inv.valorCsll.toFixed(2)}</b></span>
                        <span>IR: <b className="text-orange-600">{inv.valorIr.toFixed(2)}</b></span>
                        <span>PIS: <b>{inv.valorPis.toFixed(2)}</b></span>
                        <span>COF: <b>{inv.valorCofins.toFixed(2)}</b></span>
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
    </div>
  );
};

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
