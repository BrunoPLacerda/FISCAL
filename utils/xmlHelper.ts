
import { NfseData } from '../types.ts';

/**
 * Remove acentos e caracteres especiais
 */
const sanitizeText = (text: string): string => {
  if (!text) return '';
  let clean = text.replace(/[\uFFFD]/g, '').replace(/\?\?/g, '');
  clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return clean.trim();
};

/**
 * Converte string do XML para número de forma inteligente.
 */
const parseXmlNumber = (value: string): number => {
  if (!value) return 0;
  let normalized = value.trim().replace(/\s/g, '');
  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.'); 
  }
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
};

const getTagValue = (parent: Element, tagName: string): string => {
  if (!parent) return '';
  // Tenta com namespace primeiro
  const elements = parent.getElementsByTagNameNS('*', tagName);
  if (elements.length > 0) return elements[0].textContent || '';
  // Fallback para busca direta
  const fallback = parent.getElementsByTagName(tagName);
  if (fallback.length > 0) return fallback[0].textContent || '';
  return '';
};

export const parseNfseXml = (xmlString: string): NfseData[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  const invoices: NfseData[] = [];

  // Detectar se é Portal Nacional (SPED)
  const isPortalNacional = xmlDoc.getElementsByTagNameNS('http://www.sped.fazenda.gov.br/nfse', 'NFSe').length > 0 || 
                           xmlDoc.getElementsByTagName('NFSe').length > 0;

  if (isPortalNacional) {
    const infNfseElements = xmlDoc.getElementsByTagNameNS('*', 'infNFSe');
    for (let i = 0; i < infNfseElements.length; i++) {
      const node = infNfseElements[i];
      const dps = node.getElementsByTagNameNS('*', 'DPS')[0];
      const infDps = dps?.getElementsByTagNameNS('*', 'infDPS')[0];
      const emit = node.getElementsByTagNameNS('*', 'emit')[0];
      const toma = infDps?.getElementsByTagNameNS('*', 'toma')[0];
      const serv = infDps?.getElementsByTagNameNS('*', 'serv')[0];
      const valores = infDps?.getElementsByTagNameNS('*', 'valores')[0];
      const vServPrest = valores?.getElementsByTagNameNS('*', 'vServPrest')[0];
      
      const numero = getTagValue(node, 'nNFSe');
      const dataEmissao = getTagValue(infDps as Element, 'dhEmi') || getTagValue(node, 'dhProc');
      const valorServicos = parseXmlNumber(getTagValue(vServPrest as Element, 'vServ'));
      const discriminacao = sanitizeText(getTagValue(serv as Element, 'xDescServ'));
      
      const prestadorRazaoSocial = sanitizeText(getTagValue(emit as Element, 'xNome') || getTagValue(emit as Element, 'xFant'));
      const prestadorCnpj = getTagValue(emit as Element, 'CNPJ');
      
      const tomadorRazaoSocial = sanitizeText(getTagValue(toma as Element, 'xNome'));
      const tomadorCpfCnpj = getTagValue(toma as Element, 'CNPJ') || getTagValue(toma as Element, 'CPF');

      // Impostos Federais no Padrão Nacional
      const totTrib = valores?.getElementsByTagNameNS('*', 'totTrib')[0];
      const vTotTrib = totTrib?.getElementsByTagNameNS('*', 'vTotTrib')[0];
      
      invoices.push({
        id: node.getAttribute('Id') || `pn-${numero}-${Math.random().toString(36).substr(2, 5)}`,
        numero,
        codigoVerificacao: '',
        dataEmissao,
        valorServicos,
        valorDeducoes: 0,
        valorPis: parseXmlNumber(getTagValue(valores as Element, 'vPIS')), // Se houver detalhado
        valorCofins: parseXmlNumber(getTagValue(valores as Element, 'vCOFINS')),
        valorInss: parseXmlNumber(getTagValue(valores as Element, 'vINSS')),
        valorIr: parseXmlNumber(getTagValue(valores as Element, 'vIR')),
        valorCsll: parseXmlNumber(getTagValue(valores as Element, 'vCSLL')),
        valTotTributos: parseXmlNumber(getTagValue(vTotTrib as Element, 'vTotTribFed')),
        vBCPisCofins: 0,
        vBC_IBSCBS: 0,
        outrasRetencoes: 0,
        valorIss: 0,
        issRetido: parseXmlNumber(getTagValue(valores as Element, 'tpRetISSQN')) === 1 ? 1 : 2,
        aliquota: 0,
        descontoIncondicionado: 0,
        descontoCondicionado: 0,
        baseCalculo: parseXmlNumber(getTagValue(node.getElementsByTagNameNS('*', 'valores')[0] as Element, 'vBC')),
        valorLiquidoNfse: parseXmlNumber(getTagValue(node.getElementsByTagNameNS('*', 'valores')[0] as Element, 'vLiq')) || valorServicos,
        itemListaServico: discriminacao,
        codigoCnae: getTagValue(serv as Element, 'cTribNac'),
        codigoTributacaoMunicipio: getTagValue(serv as Element, 'cTribMun'),
        descricaoCodigoTributacaoMunicipio: '',
        discriminacao,
        prestadorRazaoSocial,
        prestadorCnpj,
        tomadorRazaoSocial,
        tomadorCpfCnpj,
        codigoMunicipio: getTagValue(node, 'cLocIncid'),
        uf: getTagValue(emit?.getElementsByTagNameNS('*', 'enderNac')[0] as Element, 'UF')
      });
    }
  } else {
    // PADRÃO GISS / ABRASF (Original)
    let infNfseElements = xmlDoc.getElementsByTagNameNS('*', 'InfNfse');
    if (infNfseElements.length === 0) infNfseElements = xmlDoc.getElementsByTagName('InfNfse');

    for (let i = 0; i < infNfseElements.length; i++) {
      const node = infNfseElements[i];
      const numero = getTagValue(node, 'Numero');
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

      const discriminacao = sanitizeText(getTagValue(servico as Element, 'Discriminacao') || getTagValue(servico as Element, 'xDescServ'));

      const prestador = node.getElementsByTagNameNS('*', 'PrestadorServico')[0] || 
                        node.getElementsByTagNameNS('*', 'Prestador')[0];
      const prestadorRazaoSocial = sanitizeText(getTagValue(prestador as Element, 'RazaoSocial') || getTagValue(prestador as Element, 'xNome'));
      const prestadorCnpj = getTagValue(prestador as Element, 'Cnpj') || 
                            getTagValue(prestador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cnpj');

      const tomador = node.getElementsByTagNameNS('*', 'TomadorServico')[0] || 
                      node.getElementsByTagNameNS('*', 'Tomador')[0];
      const tomadorRazaoSocial = sanitizeText(getTagValue(tomador as Element, 'RazaoSocial') || getTagValue(tomador as Element, 'Nome') || getTagValue(tomador as Element, 'xNome'));
      const tomadorCpfCnpj = getTagValue(tomador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cnpj') || 
                             getTagValue(tomador?.getElementsByTagNameNS('*', 'CpfCnpj')[0] as Element, 'Cpf') ||
                             getTagValue(tomador as Element, 'CNPJ');

      invoices.push({
        id: node.getAttribute('Id') || `inv-${numero}-${Math.random().toString(36).substr(2, 5)}`,
        numero,
        codigoVerificacao: getTagValue(node, 'CodigoVerificacao'),
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
        itemListaServico: sanitizeText(getTagValue(servico as Element, 'ItemListaServico')),
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
  }

  return invoices;
};
