'use client';

import {
  AlertTriangle,
  ArrowDownToLine,
  BadgePercent,
  BarChart3,
  Boxes,
  Check,
  CircleDollarSign,
  CreditCard,
  HandCoins,
  PackagePlus,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  ShoppingBag,
  Truck,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

type DiscountType = 'amount' | 'percent';

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stockQuantity: number;
  lowStockThreshold: number;
  defaultPurchasePrice: number;
  defaultSalePrice: number;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  totalPurchased?: number;
  totalPaid?: number;
  debt?: number;
};

type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

type Sale = {
  id: string;
  customerName: string;
  date: string;
  totalAmount: number;
  amountReceived: number;
  balanceDue: number;
  profit: number;
  items: Array<{ productName: string; quantity: number; unitPrice: number; discountAmount: number; lineTotal: number }>;
};

type SupplierOrder = {
  id: string;
  supplierName: string;
  date: string;
  status: 'pending' | 'received';
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  items: Array<{ productName: string; quantity: number; unitCost: number; lineTotal: number }>;
};

type Summary = {
  totalSpent: number;
  totalPurchases: number;
  supplierDebt: number;
  totalRevenue: number;
  totalReceived: number;
  customerDebt: number;
  grossProfit: number;
  cashBalance: number;
  stockValue: number;
  productCount: number;
  lowStockProducts: Product[];
  monthly: Array<{ month: string; revenue: number; received: number; spent: number; profit: number; customerDebt: number }>;
  customersWithDebt: Customer[];
  recentSales: Sale[];
  recentSupplierOrders: SupplierOrder[];
};

type Bootstrap = {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: Sale[];
  supplierOrders: SupplierOrder[];
  summary: Summary;
};

type SaleLineDraft = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType;
  discountValue: number;
};

type OrderLineDraft = {
  productId: string;
  quantity: number;
  unitCost: number;
};

const money = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'XOF',
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

const emptyBootstrap: Bootstrap = {
  products: [],
  customers: [],
  suppliers: [],
  sales: [],
  supplierOrders: [],
  summary: {
    totalSpent: 0,
    totalPurchases: 0,
    supplierDebt: 0,
    totalRevenue: 0,
    totalReceived: 0,
    customerDebt: 0,
    grossProfit: 0,
    cashBalance: 0,
    stockValue: 0,
    productCount: 0,
    lowStockProducts: [],
    monthly: [],
    customersWithDebt: [],
    recentSales: [],
    recentSupplierOrders: [],
  },
};

const today = () => new Date().toISOString().slice(0, 10);

export default function BusinessDashboard() {
  const [data, setData] = useState<Bootstrap>(emptyBootstrap);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales' | 'stock' | 'suppliers' | 'customers'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');

  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    category: '',
    unit: 'piece',
    stockQuantity: 0,
    lowStockThreshold: 5,
    defaultPurchasePrice: 0,
    defaultSalePrice: 0,
  });
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', email: '' });
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '' });
  const [saleForm, setSaleForm] = useState({
    customerId: '',
    date: today(),
    amountReceived: 0,
    items: [{ productId: '', quantity: 1, unitPrice: 0, discountType: 'amount' as DiscountType, discountValue: 0 }],
  });
  const [orderForm, setOrderForm] = useState({
    supplierId: '',
    date: today(),
    status: 'received' as 'pending' | 'received',
    amountPaid: 0,
    items: [{ productId: '', quantity: 1, unitCost: 0 }],
  });
  const [paymentForm, setPaymentForm] = useState({ saleId: '', amount: 0, note: '' });

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/bootstrap`, { cache: 'no-store' });
      if (!response.ok) throw new Error('API indisponible');
      const payload = (await response.json()) as Bootstrap;
      setData(payload);
      setSaleForm((current) => ({
        ...current,
        customerId: current.customerId || payload.customers[0]?.id || '',
        items: current.items.map((item) => hydrateSaleLine(item, payload.products)),
      }));
      setOrderForm((current) => ({
        ...current,
        supplierId: current.supplierId || payload.suppliers[0]?.id || '',
        items: current.items.map((item) => hydrateOrderLine(item, payload.products)),
      }));
      setPaymentForm((current) => ({ ...current, saleId: current.saleId || payload.sales.find((sale) => sale.balanceDue > 0)?.id || '' }));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.products;
    return data.products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(needle));
  }, [data.products, query]);

  const salePreview = useMemo(() => {
    return saleForm.items.reduce(
      (acc, item) => {
        const subtotal = item.quantity * item.unitPrice;
        const discount = item.discountType === 'percent' ? subtotal * (item.discountValue / 100) : item.discountValue;
        const total = Math.max(0, subtotal - discount);
        return {
          subtotal: acc.subtotal + subtotal,
          discount: acc.discount + Math.min(subtotal, discount),
          total: acc.total + total,
        };
      },
      { subtotal: 0, discount: 0, total: 0 },
    );
  }, [saleForm.items]);

  const orderPreview = useMemo(() => {
    return orderForm.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  }, [orderForm.items]);

  const unpaidSales = data.sales.filter((sale) => sale.balanceDue > 0);

  async function submitJson(path: string, payload: unknown, success: string) {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || 'Operation refusee');
      }
      setMessage(success);
      await refresh();
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur inconnue');
      return null;
    } finally {
      setSaving(false);
    }
  }

  const createProduct = async (event: FormEvent) => {
    event.preventDefault();
    const created = await submitJson('/products', productForm, 'Produit ajoute au stock.');
    if (created) {
      setProductForm({
        name: '',
        sku: '',
        category: '',
        unit: 'piece',
        stockQuantity: 0,
        lowStockThreshold: 5,
        defaultPurchasePrice: 0,
        defaultSalePrice: 0,
      });
    }
  };

  const createCustomer = async (event: FormEvent) => {
    event.preventDefault();
    const created = await submitJson('/customers', customerForm, 'Client ajoute.');
    if (created) setCustomerForm({ name: '', phone: '', email: '' });
  };

  const createSupplier = async (event: FormEvent) => {
    event.preventDefault();
    const created = await submitJson('/suppliers', supplierForm, 'Fournisseur ajoute.');
    if (created) setSupplierForm({ name: '', phone: '', email: '' });
  };

  const createSale = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      ...saleForm,
      items: saleForm.items.filter((item) => item.productId),
    };
    const created = await submitJson('/sales', payload, 'Vente enregistree.');
    if (created) {
      setSaleForm({
        customerId: data.customers[0]?.id || '',
        date: today(),
        amountReceived: 0,
        items: [{ productId: '', quantity: 1, unitPrice: 0, discountType: 'amount', discountValue: 0 }],
      });
    }
  };

  const createOrder = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      ...orderForm,
      items: orderForm.items.filter((item) => item.productId),
    };
    const created = await submitJson('/supplier-orders', payload, 'Commande fournisseur enregistree.');
    if (created) {
      setOrderForm({
        supplierId: data.suppliers[0]?.id || '',
        date: today(),
        status: 'received',
        amountPaid: 0,
        items: [{ productId: '', quantity: 1, unitCost: 0 }],
      });
    }
  };

  const addPayment = async (event: FormEvent) => {
    event.preventDefault();
    const created = await submitJson(`/sales/${paymentForm.saleId}/payments`, paymentForm, 'Paiement client ajoute.');
    if (created) setPaymentForm({ saleId: unpaidSales[0]?.id || '', amount: 0, note: '' });
  };

  const addSaleLine = () => {
    setSaleForm((current) => ({
      ...current,
      items: [...current.items, { productId: '', quantity: 1, unitPrice: 0, discountType: 'amount', discountValue: 0 }],
    }));
  };

  const addOrderLine = () => {
    setOrderForm((current) => ({
      ...current,
      items: [...current.items, { productId: '', quantity: 1, unitCost: 0 }],
    }));
  };

  const updateSaleLine = (index: number, patch: Partial<SaleLineDraft>) => {
    setSaleForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };
        if (patch.productId) return hydrateSaleLine(next, data.products);
        return next;
      }),
    }));
  };

  const updateOrderLine = (index: number, patch: Partial<OrderLineDraft>) => {
    setOrderForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };
        if (patch.productId) return hydrateOrderLine(next, data.products);
        return next;
      }),
    }));
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <WalletCards size={22} />
          </div>
          <div>
            <strong>Gestion Business</strong>
            <span>Ventes, stock, finances</span>
          </div>
        </div>
        <nav className="nav-list">
          <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
            <BarChart3 size={18} /> Tableau
          </button>
          <button className={activeTab === 'sales' ? 'active' : ''} onClick={() => setActiveTab('sales')}>
            <ShoppingBag size={18} /> Ventes
          </button>
          <button className={activeTab === 'stock' ? 'active' : ''} onClick={() => setActiveTab('stock')}>
            <Boxes size={18} /> Stock
          </button>
          <button className={activeTab === 'suppliers' ? 'active' : ''} onClick={() => setActiveTab('suppliers')}>
            <Truck size={18} /> Fournisseurs
          </button>
          <button className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}>
            <Users size={18} /> Clients
          </button>
        </nav>
        <button className="ghost-button" onClick={refresh} title="Actualiser">
          <RefreshCcw size={16} /> Actualiser
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Pilotage commercial</p>
            <h1>{tabTitle(activeTab)}</h1>
          </div>
          <div className="status-pill">
            {loading ? <RefreshCcw size={16} className="spin" /> : <Check size={16} />}
            {loading ? 'Chargement' : 'Donnees a jour'}
          </div>
        </header>

        {message && <div className="toast">{message}</div>}

        {activeTab === 'dashboard' && (
          <div className="content-grid">
            <section className="metric-grid">
              <Metric title="Montant depense" value={money.format(data.summary.totalSpent)} note={`${money.format(data.summary.totalPurchases)} commandes`} icon={<ArrowDownToLine />} tone="amber" />
              <Metric title="Montant recu" value={money.format(data.summary.totalReceived)} note={`${money.format(data.summary.totalRevenue)} facture`} icon={<HandCoins />} tone="green" />
              <Metric title="Benefice brut" value={money.format(data.summary.grossProfit)} note={`${money.format(data.summary.cashBalance)} tresorerie nette`} icon={<CircleDollarSign />} tone="blue" />
              <Metric title="Dettes clients" value={money.format(data.summary.customerDebt)} note={`${data.summary.customersWithDebt.length} client(s)`} icon={<CreditCard />} tone="red" />
              <Metric title="Valeur stock" value={money.format(data.summary.stockValue)} note={`${data.summary.productCount} produits`} icon={<Boxes />} tone="violet" />
              <Metric title="Dette fournisseur" value={money.format(data.summary.supplierDebt)} note="Reste a payer" icon={<ReceiptText />} tone="slate" />
            </section>

            <section className="panel wide">
              <div className="panel-heading">
                <h2>Benefice mensuel</h2>
                <BadgePercent size={19} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mois</th>
                      <th>Ventes</th>
                      <th>Encaisse</th>
                      <th>Depense</th>
                      <th>Benefice</th>
                      <th>Dette client</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.summary.monthly.length === 0 && <EmptyRow colSpan={6} label="Aucun mouvement financier" />}
                    {data.summary.monthly.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{money.format(row.revenue)}</td>
                        <td>{money.format(row.received)}</td>
                        <td>{money.format(row.spent)}</td>
                        <td className="positive">{money.format(row.profit)}</td>
                        <td className={row.customerDebt > 0 ? 'negative' : ''}>{money.format(row.customerDebt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Alertes stock</h2>
                <AlertTriangle size={19} />
              </div>
              <div className="stack-list">
                {data.summary.lowStockProducts.length === 0 && <p className="muted">Aucun produit sous le seuil.</p>}
                {data.summary.lowStockProducts.map((product) => (
                  <article className="list-card" key={product.id}>
                    <strong>{product.name}</strong>
                    <span>
                      {number.format(product.stockQuantity)} {product.unit} disponibles, seuil {number.format(product.lowStockThreshold)}
                    </span>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Clients debiteurs</h2>
                <Users size={19} />
              </div>
              <div className="stack-list">
                {data.summary.customersWithDebt.length === 0 && <p className="muted">Aucune dette client.</p>}
                {data.summary.customersWithDebt.map((customer) => (
                  <article className="list-card" key={customer.id}>
                    <strong>{customer.name}</strong>
                    <span>{money.format(customer.debt || 0)} restant</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="content-grid">
            <form className="panel wide form-grid" onSubmit={createSale}>
              <div className="panel-heading">
                <h2>Nouvelle vente</h2>
                <ShoppingBag size={19} />
              </div>
              <label>
                Client
                <select value={saleForm.customerId} onChange={(event) => setSaleForm({ ...saleForm, customerId: event.target.value })} required>
                  <option value="">Choisir</option>
                  {data.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" value={saleForm.date} onChange={(event) => setSaleForm({ ...saleForm, date: event.target.value })} required />
              </label>
              <label>
                Montant recu / avance
                <input type="number" min="0" value={saleForm.amountReceived} onChange={(event) => setSaleForm({ ...saleForm, amountReceived: Number(event.target.value) })} />
              </label>
              <div className="line-editor">
                {saleForm.items.map((item, index) => (
                  <div className="line-row" key={index}>
                    <select value={item.productId} onChange={(event) => updateSaleLine(index, { productId: event.target.value })} required>
                      <option value="">Produit</option>
                      {data.products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateSaleLine(index, { quantity: Number(event.target.value) })} aria-label="Quantite" />
                    <input type="number" min="0" value={item.unitPrice} onChange={(event) => updateSaleLine(index, { unitPrice: Number(event.target.value) })} aria-label="Prix de vente" />
                    <select value={item.discountType} onChange={(event) => updateSaleLine(index, { discountType: event.target.value as DiscountType })} aria-label="Type de remise">
                      <option value="amount">Remise XOF</option>
                      <option value="percent">Remise %</option>
                    </select>
                    <input type="number" min="0" value={item.discountValue} onChange={(event) => updateSaleLine(index, { discountValue: Number(event.target.value) })} aria-label="Remise" />
                  </div>
                ))}
                <button type="button" className="ghost-button inline" onClick={addSaleLine}>
                  <Plus size={16} /> Ligne
                </button>
              </div>
              <div className="preview-bar">
                <span>Sous-total {money.format(salePreview.subtotal)}</span>
                <span>Remise {money.format(salePreview.discount)}</span>
                <strong>Total {money.format(salePreview.total)}</strong>
                <span>Dette {money.format(Math.max(0, salePreview.total - saleForm.amountReceived))}</span>
              </div>
              <button className="primary-button" disabled={saving}>
                <Check size={17} /> Enregistrer la vente
              </button>
            </form>

            <form className="panel form-grid" onSubmit={addPayment}>
              <div className="panel-heading">
                <h2>Reglement client</h2>
                <HandCoins size={19} />
              </div>
              <label>
                Vente
                <select value={paymentForm.saleId} onChange={(event) => setPaymentForm({ ...paymentForm, saleId: event.target.value })} required>
                  <option value="">Choisir</option>
                  {unpaidSales.map((sale) => (
                    <option key={sale.id} value={sale.id}>
                      {sale.customerName} - {money.format(sale.balanceDue)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Montant
                <input type="number" min="0" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })} required />
              </label>
              <label>
                Note
                <input value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} placeholder="Espece, mobile money..." />
              </label>
              <button className="primary-button" disabled={saving || unpaidSales.length === 0}>
                <CreditCard size={17} /> Ajouter paiement
              </button>
            </form>

            <section className="panel wide">
              <div className="panel-heading">
                <h2>Historique ventes</h2>
                <ReceiptText size={19} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Total</th>
                      <th>Recu</th>
                      <th>Dette</th>
                      <th>Benefice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.length === 0 && <EmptyRow colSpan={6} label="Aucune vente" />}
                    {data.sales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{sale.date}</td>
                        <td>{sale.customerName}</td>
                        <td>{money.format(sale.totalAmount)}</td>
                        <td>{money.format(sale.amountReceived)}</td>
                        <td className={sale.balanceDue > 0 ? 'negative' : ''}>{money.format(sale.balanceDue)}</td>
                        <td className="positive">{money.format(sale.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'stock' && (
          <div className="content-grid">
            <form className="panel form-grid" onSubmit={createProduct}>
              <div className="panel-heading">
                <h2>Nouveau produit</h2>
                <PackagePlus size={19} />
              </div>
              <label>
                Nom
                <input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required />
              </label>
              <label>
                Reference
                <input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} />
              </label>
              <label>
                Categorie
                <input value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} />
              </label>
              <label>
                Unite
                <input value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })} />
              </label>
              <label>
                Stock initial
                <input type="number" value={productForm.stockQuantity} onChange={(event) => setProductForm({ ...productForm, stockQuantity: Number(event.target.value) })} />
              </label>
              <label>
                Seuil alerte
                <input type="number" value={productForm.lowStockThreshold} onChange={(event) => setProductForm({ ...productForm, lowStockThreshold: Number(event.target.value) })} />
              </label>
              <label>
                Prix achat
                <input type="number" value={productForm.defaultPurchasePrice} onChange={(event) => setProductForm({ ...productForm, defaultPurchasePrice: Number(event.target.value) })} />
              </label>
              <label>
                Prix vente
                <input type="number" value={productForm.defaultSalePrice} onChange={(event) => setProductForm({ ...productForm, defaultSalePrice: Number(event.target.value) })} />
              </label>
              <button className="primary-button" disabled={saving}>
                <Plus size={17} /> Ajouter
              </button>
            </form>

            <section className="panel wide">
              <div className="panel-heading">
                <h2>Produits</h2>
                <div className="search-box">
                  <Search size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" />
                </div>
              </div>
              <div className="product-grid">
                {filteredProducts.map((product) => (
                  <article className="product-card" key={product.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <span>{product.sku || product.category}</span>
                    </div>
                    <div className="stock-pill">
                      {number.format(product.stockQuantity)} {product.unit}
                    </div>
                    <dl>
                      <div>
                        <dt>Achat</dt>
                        <dd>{money.format(product.defaultPurchasePrice)}</dd>
                      </div>
                      <div>
                        <dt>Vente</dt>
                        <dd>{money.format(product.defaultSalePrice)}</dd>
                      </div>
                      <div>
                        <dt>Marge</dt>
                        <dd>{money.format(product.defaultSalePrice - product.defaultPurchasePrice)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'suppliers' && (
          <div className="content-grid">
            <form className="panel form-grid" onSubmit={createSupplier}>
              <div className="panel-heading">
                <h2>Nouveau fournisseur</h2>
                <Truck size={19} />
              </div>
              <label>
                Nom
                <input value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} required />
              </label>
              <label>
                Telephone
                <input value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} />
              </label>
              <label>
                Email
                <input value={supplierForm.email} onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })} />
              </label>
              <button className="primary-button" disabled={saving}>
                <UserPlus size={17} /> Ajouter
              </button>
            </form>

            <form className="panel wide form-grid" onSubmit={createOrder}>
              <div className="panel-heading">
                <h2>Commande fournisseur</h2>
                <PackagePlus size={19} />
              </div>
              <label>
                Fournisseur
                <select value={orderForm.supplierId} onChange={(event) => setOrderForm({ ...orderForm, supplierId: event.target.value })} required>
                  <option value="">Choisir</option>
                  {data.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" value={orderForm.date} onChange={(event) => setOrderForm({ ...orderForm, date: event.target.value })} />
              </label>
              <label>
                Statut
                <select value={orderForm.status} onChange={(event) => setOrderForm({ ...orderForm, status: event.target.value as 'pending' | 'received' })}>
                  <option value="received">Recu en stock</option>
                  <option value="pending">En attente</option>
                </select>
              </label>
              <label>
                Montant paye
                <input type="number" min="0" value={orderForm.amountPaid} onChange={(event) => setOrderForm({ ...orderForm, amountPaid: Number(event.target.value) })} />
              </label>
              <div className="line-editor">
                {orderForm.items.map((item, index) => (
                  <div className="line-row three" key={index}>
                    <select value={item.productId} onChange={(event) => updateOrderLine(index, { productId: event.target.value })} required>
                      <option value="">Produit</option>
                      {data.products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateOrderLine(index, { quantity: Number(event.target.value) })} aria-label="Quantite" />
                    <input type="number" min="0" value={item.unitCost} onChange={(event) => updateOrderLine(index, { unitCost: Number(event.target.value) })} aria-label="Prix achat" />
                  </div>
                ))}
                <button type="button" className="ghost-button inline" onClick={addOrderLine}>
                  <Plus size={16} /> Ligne
                </button>
              </div>
              <div className="preview-bar">
                <strong>Total {money.format(orderPreview)}</strong>
                <span>Reste fournisseur {money.format(Math.max(0, orderPreview - orderForm.amountPaid))}</span>
              </div>
              <button className="primary-button" disabled={saving}>
                <Check size={17} /> Enregistrer commande
              </button>
            </form>

            <section className="panel wide">
              <div className="panel-heading">
                <h2>Historique commandes</h2>
                <Truck size={19} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Fournisseur</th>
                      <th>Statut</th>
                      <th>Total</th>
                      <th>Paye</th>
                      <th>Dette</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.supplierOrders.length === 0 && <EmptyRow colSpan={6} label="Aucune commande fournisseur" />}
                    {data.supplierOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.date}</td>
                        <td>{order.supplierName}</td>
                        <td>{order.status === 'received' ? 'Recu' : 'En attente'}</td>
                        <td>{money.format(order.totalAmount)}</td>
                        <td>{money.format(order.amountPaid)}</td>
                        <td className={order.balanceDue > 0 ? 'negative' : ''}>{money.format(order.balanceDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="content-grid">
            <form className="panel form-grid" onSubmit={createCustomer}>
              <div className="panel-heading">
                <h2>Nouveau client</h2>
                <UserPlus size={19} />
              </div>
              <label>
                Nom
                <input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} required />
              </label>
              <label>
                Telephone
                <input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} />
              </label>
              <label>
                Email
                <input value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} />
              </label>
              <button className="primary-button" disabled={saving}>
                <Plus size={17} /> Ajouter
              </button>
            </form>

            <section className="panel wide">
              <div className="panel-heading">
                <h2>Comptes clients</h2>
                <Users size={19} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Telephone</th>
                      <th>Total achats</th>
                      <th>Total paye</th>
                      <th>Dette</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.map((customer) => (
                      <tr key={customer.id}>
                        <td>{customer.name}</td>
                        <td>{customer.phone || '-'}</td>
                        <td>{money.format(customer.totalPurchased || 0)}</td>
                        <td>{money.format(customer.totalPaid || 0)}</td>
                        <td className={(customer.debt || 0) > 0 ? 'negative' : ''}>{money.format(customer.debt || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function hydrateSaleLine(line: SaleLineDraft, products: Product[]): SaleLineDraft {
  const product = products.find((item) => item.id === line.productId);
  return {
    ...line,
    unitPrice: product ? product.defaultSalePrice : line.unitPrice,
  };
}

function hydrateOrderLine(line: OrderLineDraft, products: Product[]): OrderLineDraft {
  const product = products.find((item) => item.id === line.productId);
  return {
    ...line,
    unitCost: product ? product.defaultPurchasePrice : line.unitCost,
  };
}

function tabTitle(tab: string) {
  const titles: Record<string, string> = {
    dashboard: 'Tableau de bord',
    sales: 'Ventes et paiements',
    stock: 'Produits et stock',
    suppliers: 'Achats fournisseurs',
    customers: 'Clients et dettes',
  };
  return titles[tab] || 'Gestion';
}

function Metric({ title, value, note, icon, tone }: { title: string; value: string; note: string; icon: React.ReactNode; tone: string }) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty-cell">
        {label}
      </td>
    </tr>
  );
}
