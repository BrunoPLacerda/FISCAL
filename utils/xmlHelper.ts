
import { NfseData } from '../types';

/**
 * Converte string do XML para número de forma inteligente.
 * Identifica se o valor usa ponto ou vírgula como separador decimal.
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
    const valorDeducoes = parseXmlNumber(getTagValue(valoresDps as Element, 'ValorDeducoes'));
    const valorPis = parseXmlNumber(getTagValue(valoresDps as Element, 'ValorPis') || getTagValue(valoresDps?.getElementsByTagNameNS('*', 'piscofins')[0] as Element, 'vPis'));
    const valorCofins = parseXmlNumber(getTagValue(valoresDps as Element, 'ValorCofins') || getTagValue(valoresDps?.getElementsByTagNameNS('*', 'piscofins')[0] as Element, 'vCofins'));
    const valorInss = parseXmlNumber(getTagValue(valoresDps as Element, 'ValorInss'));
    const valorIr = parseXmlNumber(getTagValue(valoresDps as Element, 'ValorIr'));
    const valorCsll = parseXmlNumber(getTagValue(valoresDps as Element, 'ValorCsll'));
    const valTotTributos = parseXmlNumber(getTagValue(valoresDps as Element, 'ValTotTributos'));
    
    const vBCPisCofins = parseXmlNumber(getTagValue(valoresDps?.getElementsByTagNameNS('*', 'piscofins')[0] as Element, 'vBCPisCofins'));
    const ibscbs = valoresDps?.getElementsByTagNameNS('*', 'IBSCBS')[0];
    const vBC_IBSCBS = parseXmlNumber(getTagValue(ibscbs?.getElementsByTagNameNS('*', 'valores')[0] as Element, 'vBC'));

    const outrasRetencoes = parseXmlNumber(getTagValue(valoresDps as Element, 'OutrasRetencoes'));
    const valorIss = parseXmlNumber(getTagValue(valoresNfse as Element, 'ValorIss') || getTagValue(valoresDps as Element, 'ValorIss'));
    
    // Captura o indicador de ISS Retido (1 = Sim, 2 = Não)
    const issRetido = parseXmlNumber(
      getTagValue(valoresNfse as Element, 'IssRetido') || 
      getTagValue(valoresDps as Element, 'IssRetido') || 
      getTagValue(servico as Element, 'IssRetido')
    );

    const aliquota = parseXmlNumber(getTagValue(valoresNfse as Element, 'Aliquota') || getTagValue(valoresDps as Element, 'Aliquota'));
    const baseCalculo = parseXmlNumber(getTagValue(valoresNfse as Element, 'BaseCalculo') || getTagValue(valoresDps as Element, 'vBC'));
    const valorLiquidoNfse = parseXmlNumber(getTagValue(valoresNfse as Element, 'ValorLiquidoNfse'));

    const itemListaServico = getTagValue(servico as Element, 'ItemListaServico');
    const codigoCnae = getTagValue(servico as Element, 'CodigoCnae');
    const codigoTributacaoMunicipio = getTagValue(servico as Element, 'CodigoTributacaoMunicipio');
    const descricaoCodigoTributacaoMunicipio = getTagValue(servico as Element, 'DescricaoCodigoTributacaoMunicipio');
    
    const discriminacao = getTagValue(servico as Element, 'Discriminacao');

    const prestador = node.getElementsByTagNameNS('*', 'PrestadorServico')[0] || 
                      node.getElementsByTagNameNS('*', 'Prestador')[0] ||
                      dps.getElementsByTagNameNS('*', 'Prestador')[0];
    const prestadorRazaoSocial = getTagValue(prestador as Element, 'RazaoSocial');
    const prestadorCnpj = getTagValue(prestador as Element, 'Cnpj') || 
                          getTagValue(prestador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cnpj');

    const tomador = node.getElementsByTagNameNS('*', 'TomadorServico')[0] || 
                    node.getElementsByTagNameNS('*', 'Tomador')[0] ||
                    dps.getElementsByTagNameNS('*', 'TomadorServico')[0];
    const tomadorRazaoSocial = getTagValue(tomador as Element, 'RazaoSocial') || getTagValue(tomador as Element, 'Nome');
    const tomadorCpfCnpj = getTagValue(tomador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cnpj') || 
                           getTagValue(tomador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cpf') ||
                           getTagValue(tomador as Element, 'Cnpj') ||
                           getTagValue(tomador as Element, 'Cpf');

    const orgao = node.getElementsByTagNameNS('*', 'OrgaoGerador')[0];
    const codigoMunicipio = getTagValue(orgao as Element, 'CodigoMunicipio');
    const uf = getTagValue(orgao as Element, 'Uf');

    invoices.push({
      id: node.getAttribute('Id') || `inv-${numero}-${Math.random().toString(36).substr(2, 5)}`,
      numero,
      codigoVerificacao,
      dataEmissao,
      valorServicos,
      valorDeducoes,
      valorPis,
      valorCofins,
      valorInss,
      valorIr,
      valorCsll,
      valTotTributos,
      vBCPisCofins,
      vBC_IBSCBS,
      outrasRetencoes,
      valorIss,
      issRetido,
      aliquota,
      descontoIncondicionado: parseXmlNumber(getTagValue(valoresDps as Element, 'DescontoIncondicionado')),
      descontoCondicionado: parseXmlNumber(getTagValue(valoresDps as Element, 'DescontoCondicionado')),
      baseCalculo,
      valorLiquidoNfse: valorLiquidoNfse || (valorServicos - valorPis - valorCofins - valorInss - valorIr - valorCsll - outrasRetencoes),
      itemListaServico,
      codigoCnae,
      codigoTributacaoMunicipio,
      descricaoCodigoTributacaoMunicipio,
      discriminacao,
      prestadorRazaoSocial,
      prestadorCnpj,
      tomadorRazaoSocial,
      tomadorCpfCnpj,
      codigoMunicipio,
      uf
    });
  }

  return invoices;
};
