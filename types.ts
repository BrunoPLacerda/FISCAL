
export interface NfseData {
  id: string;
  numero: string;
  codigoVerificacao: string;
  dataEmissao: string;
  valorServicos: number;
  valorDeducoes: number;
  valorPis: number;
  valorCofins: number;
  valorInss: number;
  valorIr: number;
  valorCsll: number;
  valTotTributos: number;
  vBCPisCofins: number;
  vBC_IBSCBS: number;
  outrasRetencoes: number;
  valorIss: number;
  issRetido: number; // 1 = Sim, 2 = Não
  aliquota: number;
  descontoIncondicionado: number;
  descontoCondicionado: number;
  baseCalculo: number;
  valorLiquidoNfse: number;
  itemListaServico: string;
  codigoCnae: string;
  codigoTributacaoMunicipio: string;
  descricaoCodigoTributacaoMunicipio: string;
  discriminacao: string;
  prestadorRazaoSocial: string;
  prestadorCnpj: string;
  tomadorRazaoSocial: string;
  tomadorCpfCnpj: string;
  codigoMunicipio: string;
  uf: string;
}

export interface AppState {
  invoices: NfseData[];
  loading: boolean;
}
