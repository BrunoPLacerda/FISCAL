
import { NfseData } from '../types.ts';

/**
 * Remove acentos e caracteres especiais (ex: ç -> c, ã -> a)
 * Também remove caracteres de erro de encoding () e pontos de interrogação duplos.
 */
const sanitizeText = (text: string): string => {
  if (!text) return '';
  
  // 1. Remove caracteres de erro de encoding comuns () e sequências de interrogação que indicam erro
  let clean = text.replace(/[\uFFFD]/g, '').replace(/\?\?/g, '');

  // 2. Normaliza para remover acentos (NFD separa o caractere do acento, o regex remove o acento)
  clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 3. Remove outros caracteres especiais não-ASCII que possam ter sobrado, mantendo o básico
  // Opcional: clean = clean.replace(/[^\x00-\x7F]/g, ""); 
  
  return clean.trim();
};

/**
 * Converte string do XML para número de forma inteligente.
 */
const parseXmlNumber = (value: string): number => {
  if (!value) return 0;
  let normalized = value.trim().replace(/\s/g, '');
  
  if (normalized.includes(',')) {
    normalized = normalized
      .replace(/\./g, '') 
      .replace(',', '.'); 
  }
  
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
};

const getTagValue = (parent: Element, tagName: string): string => {
  if (!parent) return '';
  const elements = parent.getElementsByTagNameNS('*', tagName);
  if (elements.length > 0) return elements[0].textContent || '';
  const fallback = parent.getElementsByTagName(tagName);
  if (fallback.length > 0) return fallback[0].textContent || '';
  return '';
};

export const parseNfseXml = (xmlString: string): NfseData[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  const invoices: NfseData[] = [];

  let infNfseElements = xmlDoc.getElementsByTagNameNS('*', 'InfNfse');
  
  for (let i = 0; i < infNfseElements.length; i++) {
    const node = infNfseElements[i];
    
    const numero = getTagValue(node, 'Numero');
    const codigoVerificacao = getTagValue(node, 'CodigoVerificacao');
    const dataEmissao = getTagValue(node, 'DataEmissao');
    
    const dps = node.getElementsByTagNameNS('*', 'InfDeclaracaoPrestacaoServico')[0] || node;
    const servico = dps.getElementsByTagNameNS('*', 'Servico')[0];
    const valoresDps = servico?.getElementsByTagNameNS('*', 'Valores')[0];
    const valoresNfse = node.getElementsByTagNameNS('*', 'ValoresNfse')[0];
    
    const rawValorServicos = getTagValue(valoresDps as Element, 'ValorServicos') || 
                             getTagValue(valoresNfse as Element, 'ValorServicos') ||
                             getTagValue(node, 'ValorServicos');

    const valorServicos = parseXmlNumber(rawValorServicos);
    const valorIss = parseXmlNumber(getTagValue(valoresNfse as Element, 'ValorIss') || getTagValue(valoresDps as Element, 'ValorIss'));
    const valorLiquidoNfse = parseXmlNumber(getTagValue(valoresNfse as Element, 'ValorLiquidoNfse'));

    // Campos de texto limpos (sem acentos e sem ??)
    const itemListaServico = sanitizeText(getTagValue(servico as Element, 'ItemListaServico'));
    const discriminacao = sanitizeText(getTagValue(servico as Element, 'Discriminacao'));

    const prestador = node.getElementsByTagNameNS('*', 'PrestadorServico')[0] || 
                      node.getElementsByTagNameNS('*', 'Prestador')[0] ||
                      dps.getElementsByTagNameNS('*', 'Prestador')[0];
    const prestadorRazaoSocial = sanitizeText(getTagValue(prestador as Element, 'RazaoSocial'));
    const prestadorCnpj = getTagValue(prestador as Element, 'Cnpj') || 
                          getTagValue(prestador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cnpj');

    const tomador = node.getElementsByTagNameNS('*', 'TomadorServico')[0] || 
                    node.getElementsByTagNameNS('*', 'Tomador')[0] ||
                    dps.getElementsByTagNameNS('*', 'TomadorServico')[0];
    const tomadorRazaoSocial = sanitizeText(getTagValue(tomador as Element, 'RazaoSocial') || getTagValue(tomador as Element, 'Nome'));
    const tomadorCpfCnpj = getTagValue(tomador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cnpj') || 
                           getTagValue(tomador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cpf');

    invoices.push({
      id: node.getAttribute('Id') || `inv-${numero}-${Math.random().toString(36).substr(2, 5)}`,
      numero,
      codigoVerificacao,
      dataEmissao,
      valorServicos,
      valorDeducoes: parseXmlNumber(getTagValue(valoresDps as Element, 'ValorDeducoes')),
      valorPis: parseXmlNumber(getTagValue(valoresDps as Element, 'ValorPis')),
      valorCofins: parseXmlNumber(getTagValue(valoresDps as Element, 'ValorCofins')),
      valorInss: parseXmlNumber(getTagValue(valoresDps as Element, 'ValorInss')),
      valorIr: parseXmlNumber(getTagValue(valoresDps as Element, 'ValorIr')),
      valorCsll: parseXmlNumber(getTagValue(valoresDps as Element, 'ValorCsll')),
      valTotTributos: parseXmlNumber(getTagValue(valoresDps as Element, 'ValTotTributos')),
      vBCPisCofins: 0,
      vBC_IBSCBS: 0,
      outrasRetencoes: parseXmlNumber(getTagValue(valoresDps as Element, 'OutrasRetencoes')),
      valorIss,
      issRetido: parseXmlNumber(getTagValue(servico as Element, 'IssRetido')),
      aliquota: parseXmlNumber(getTagValue(valoresNfse as Element, 'Aliquota')),
      descontoIncondicionado: 0,
      descontoCondicionado: 0,
      baseCalculo: parseXmlNumber(getTagValue(valoresNfse as Element, 'BaseCalculo')),
      valorLiquidoNfse: valorLiquidoNfse || (valorServicos - valorIss),
      itemListaServico,
      codigoCnae: getTagValue(servico as Element, 'CodigoCnae'),
      codigoTributacaoMunicipio: getTagValue(servico as Element, 'CodigoTributacaoMunicipio'),
      descricaoCodigoTributacaoMunicipio: '',
      discriminacao,
      prestadorRazaoSocial,
      prestadorCnpj,
      tomadorRazaoSocial,
      tomadorCpfCnpj,
      codigoMunicipio: '',
      uf: ''
    });
  }

  return invoices;
};
