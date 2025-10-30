import React, { useState, useEffect } from 'react';
import { Calculator, TrendingUp, History, Settings, Plus, Trash2, Save, Info } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// 型定義
interface ProjectCalculation {
  id: string;
  date: string;
  projectName: string;
  amount: number;
  includesTax: boolean;
  hasWithholding: boolean;
  withholdingAmount: number;
  depositAmount: number;
  estimatedTakeHome: number;
  taxBreakdown: TaxBreakdown;
}

interface TaxBreakdown {
  incomeTax: number;
  residentTax: number;
  healthInsurance: number;
  pension: number;
  businessTax: number;
  total: number;
}

interface UserSettings {
  blueReturnType: '65' | '55' | '10' | 'white';
  spouseDeduction: boolean;
  dependents: number;
  expenseRate: number;
  prefecture: string;
  businessType: string;
}

interface MonthlyData {
  month: string;
  income: number;
  takeHome: number;
}

// 都道府県別の国民健康保険料率（所得割・均等割）
const HEALTH_INSURANCE_RATES: { [key: string]: { incomeRate: number; flatRate: number } } = {
  '東京都': { incomeRate: 0.0976, flatRate: 53400 },
  '大阪府': { incomeRate: 0.1012, flatRate: 49152 },
  '神奈川県': { incomeRate: 0.0931, flatRate: 48500 },
  '愛知県': { incomeRate: 0.0889, flatRate: 45600 },
  '福岡県': { incomeRate: 0.1043, flatRate: 42300 },
  '北海道': { incomeRate: 0.1087, flatRate: 39800 },
  '埼玉県': { incomeRate: 0.0925, flatRate: 47100 },
  '千葉県': { incomeRate: 0.0945, flatRate: 46200 },
  '兵庫県': { incomeRate: 0.0998, flatRate: 44100 },
  '京都府': { incomeRate: 0.0967, flatRate: 46800 },
  'その他': { incomeRate: 0.0950, flatRate: 45000 }
};

// 個人事業税の対象業種（税率5%）
const BUSINESS_TAX_TYPES = [
  '物品販売業',
  '製造業',
  '請負業',
  'コンサルタント業',
  'デザイン業',
  'プログラミング業',
  'その他の事業'
];

// 計算ユーティリティ
const calculateWithholding = (amount: number, includesTax: boolean): number => {
  const baseAmount = includesTax ? amount / 1.1 : amount;
  return baseAmount >= 1000000 ? Math.floor(baseAmount * 0.2042) : Math.floor(baseAmount * 0.1021);
};

const calculateDetailedTax = (
  annualIncome: number,
  settings: UserSettings
): TaxBreakdown => {
  // 1. 経費を引く
  const expenses = annualIncome * (settings.expenseRate / 100);
  const revenue = annualIncome - expenses;

  // 2. 青色申告特別控除
  let blueReturnDeduction = 0;
  if (settings.blueReturnType === '65') blueReturnDeduction = 650000;
  else if (settings.blueReturnType === '55') blueReturnDeduction = 550000;
  else if (settings.blueReturnType === '10') blueReturnDeduction = 100000;

  // 3. 各種控除の計算
  const basicDeduction = 480000; // 基礎控除
  const spouseDeduction = settings.spouseDeduction ? 380000 : 0;
  const dependentDeduction = settings.dependents * 380000;
  const socialInsuranceDeduction = 199200; // 国民年金（概算）

  // 4. 課税所得の計算
  const taxableIncome = Math.max(
    0,
    revenue - blueReturnDeduction - basicDeduction - spouseDeduction - dependentDeduction - socialInsuranceDeduction
  );

  // 5. 所得税の計算（累進課税）
  let incomeTax = 0;
  if (taxableIncome <= 1950000) {
    incomeTax = taxableIncome * 0.05;
  } else if (taxableIncome <= 3300000) {
    incomeTax = 1950000 * 0.05 + (taxableIncome - 1950000) * 0.1;
  } else if (taxableIncome <= 6950000) {
    incomeTax = 1950000 * 0.05 + 1350000 * 0.1 + (taxableIncome - 3300000) * 0.2;
  } else if (taxableIncome <= 9000000) {
    incomeTax = 1950000 * 0.05 + 1350000 * 0.1 + 3650000 * 0.2 + (taxableIncome - 6950000) * 0.23;
  } else {
    incomeTax = 1950000 * 0.05 + 1350000 * 0.1 + 3650000 * 0.2 + 2050000 * 0.23 + (taxableIncome - 9000000) * 0.33;
  }

  // 復興特別所得税（2.1%）
  incomeTax = Math.floor(incomeTax * 1.021);

  // 6. 住民税（10%、均等割5000円）
  const residentTax = Math.floor(taxableIncome * 0.1) + 5000;

  // 7. 国民健康保険料
  const insuranceRate = HEALTH_INSURANCE_RATES[settings.prefecture] || HEALTH_INSURANCE_RATES['その他'];
  const healthInsurance = Math.min(
    Math.floor(revenue * insuranceRate.incomeRate) + insuranceRate.flatRate,
    1020000 // 上限額
  );

  // 8. 国民年金
  const pension = 199200; // 2024年度

  // 9. 個人事業税（事業所得が290万円超の場合のみ）
  let businessTax = 0;
  if (BUSINESS_TAX_TYPES.includes(settings.businessType) && revenue > 2900000) {
    businessTax = Math.floor((revenue - 2900000) * 0.05);
  }

  return {
    incomeTax,
    residentTax,
    healthInsurance,
    pension,
    businessTax,
    total: incomeTax + residentTax + healthInsurance + pension + businessTax
  };
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'calculator' | 'dashboard' | 'history' | 'settings'>('calculator');
  const [calculations, setCalculations] = useState<ProjectCalculation[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    blueReturnType: '65',
    spouseDeduction: false,
    dependents: 0,
    expenseRate: 30,
    prefecture: '東京都',
    businessType: 'プログラミング業'
  });
  
  // フォーム入力
  const [projectName, setProjectName] = useState('');
  const [amount, setAmount] = useState('');
  const [includesTax, setIncludesTax] = useState(true);
  const [hasWithholding, setHasWithholding] = useState(true);
  
  // 計算結果
  const [result, setResult] = useState<ProjectCalculation | null>(null);

  // ローカルストレージからデータ読み込み
  useEffect(() => {
  const loadData = async () => {
    try {
      const storedCalcs = await getFromStorage('calculations');
      if (storedCalcs) setCalculations(JSON.parse(storedCalcs));

      const storedSettings = await getFromStorage('user-settings');
      if (storedSettings) setSettings(JSON.parse(storedSettings));
    } catch (error) {
      // ここでは既に getFromStorage が localStorage にフォールバックしているが、
      // 追加の安全策が必要なら例外処理を行ってください
      console.error(error);
    }
  };
  loadData();
}, []);



  // データ保存
  const saveCalculations = async (data: ProjectCalculation[]) => {
    setCalculations(data);
    try {
      await window.storage?.set('calculations', JSON.stringify(data));
    } catch (error) {
      localStorage.setItem('calculations', JSON.stringify(data));
    }
  };

  const saveSettings = async (newSettings: UserSettings) => {
    setSettings(newSettings);
    try {
      await window.storage?.set('user-settings', JSON.stringify(newSettings));
    } catch (error) {
      localStorage.setItem('user-settings', JSON.stringify(newSettings));
    }
  };

  // ヘルパー：環境依存の storage を扱う
  const getFromStorage = async (key: string): Promise<string | null> => {
    if (window.storage) {
      const res = await window.storage.get(key);
      return res?.value ?? null;
    }
    return localStorage.getItem(key);
  };

  const setToStorage = async (key: string, value: string): Promise<void> => {
    if (window.storage) {
      await window.storage.set(key, value);
      return;
    }
    localStorage.setItem(key, value);
  };


  // 計算実行
  const handleCalculate = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    const withholdingAmount = hasWithholding ? calculateWithholding(amountNum, includesTax) : 0;
    const consumptionTax = includesTax ? amountNum - (amountNum / 1.1) : amountNum * 0.1;
    const depositAmount = includesTax 
      ? amountNum - withholdingAmount
      : amountNum + consumptionTax - withholdingAmount;

    // 年間収入を推定
    const recentCalculations = calculations.slice(-3);
    const avgMonthly = recentCalculations.length > 0
      ? recentCalculations.reduce((sum, calc) => sum + calc.amount, 0) / recentCalculations.length
      : amountNum;
    const annualIncome = avgMonthly * 12;
    
    // 詳細な税金計算
    const taxBreakdown = calculateDetailedTax(annualIncome, settings);
    const monthlyTaxBurden = taxBreakdown.total / 12;
    const estimatedTakeHome = depositAmount - monthlyTaxBurden;

    const newCalculation: ProjectCalculation = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      projectName: projectName || '案件名未設定',
      amount: amountNum,
      includesTax,
      hasWithholding,
      withholdingAmount,
      depositAmount,
      estimatedTakeHome,
      taxBreakdown
    };

    setResult(newCalculation);
    saveCalculations([...calculations, newCalculation]);
    
    // フォームリセット
    setProjectName('');
    setAmount('');
  };

  // 削除
  const handleDelete = (id: string) => {
    saveCalculations(calculations.filter(calc => calc.id !== id));
  };

  // 月次データ集計
  const getMonthlyData = (): MonthlyData[] => {
    const monthlyMap = new Map<string, { income: number; takeHome: number }>();
    
    calculations.forEach(calc => {
      const month = new Date(calc.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' });
      const existing = monthlyMap.get(month) || { income: 0, takeHome: 0 };
      monthlyMap.set(month, {
        income: existing.income + calc.amount,
        takeHome: existing.takeHome + calc.estimatedTakeHome
      });
    });

    return Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .slice(-6);
  };

  // 年間集計
  const getYearlySummary = () => {
    const thisYear = new Date().getFullYear();
    const yearlyCalcs = calculations.filter(calc => 
      new Date(calc.date).getFullYear() === thisYear
    );

    const totalIncome = yearlyCalcs.reduce((sum, calc) => sum + calc.amount, 0);
    const totalDeposit = yearlyCalcs.reduce((sum, calc) => sum + calc.depositAmount, 0);
    const totalTakeHome = yearlyCalcs.reduce((sum, calc) => sum + calc.estimatedTakeHome, 0);
    
    return { totalIncome, totalDeposit, totalTakeHome };
  };

  const yearlySummary = getYearlySummary();
  const monthlyData = getMonthlyData();

  // 円グラフ用データ
  const pieData = result ? [
    { name: '実質手取り', value: Math.max(0, result.estimatedTakeHome), color: '#10b981' },
    { name: '源泉徴収', value: result.withholdingAmount, color: '#f59e0b' },
    { name: '所得税', value: result.taxBreakdown.incomeTax / 12, color: '#ef4444' },
    { name: '住民税', value: result.taxBreakdown.residentTax / 12, color: '#dc2626' },
    { name: '健康保険', value: result.taxBreakdown.healthInsurance / 12, color: '#f97316' },
    { name: '年金', value: result.taxBreakdown.pension / 12, color: '#fb923c' }
  ].filter(item => item.value > 0) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-indigo-600">💰 フリカル</h1>
          <p className="text-sm text-gray-600">フリーランスの正確な手取り計算</p>
        </div>
      </header>

      {/* ナビゲーション */}
      <nav className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: 'calculator', icon: Calculator, label: '計算' },
              { id: 'dashboard', icon: TrendingUp, label: 'ダッシュボード' },
              { id: 'history', icon: History, label: '履歴' },
              { id: 'settings', icon: Settings, label: '設定' }
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setCurrentView(id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  currentView === id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-indigo-600'
                }`}
              >
                <Icon size={18} />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 計算画面 */}
        {currentView === 'calculator' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* 入力フォーム */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4 text-gray-800">案件報酬を入力</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    案件名（任意）
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="例: Webサイト制作"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    報酬額
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="100000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includesTax}
                      onChange={(e) => setIncludesTax(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">消費税込み</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasWithholding}
                      onChange={(e) => setHasWithholding(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">源泉徴収あり</span>
                  </label>
                </div>

                <button
                  onClick={handleCalculate}
                  disabled={!amount}
                  className="w-full bg-indigo-600 text-white py-3 rounded-md font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <Calculator size={20} />
                  計算する
                </button>

                {/* 現在の設定表示 */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
                  <div className="font-medium mb-1">現在の設定</div>
                  <div className="space-y-0.5">
                    <div>申告: {settings.blueReturnType === 'white' ? '白色' : `青色${settings.blueReturnType}万円控除`}</div>
                    <div>経費率: {settings.expenseRate}%</div>
                    <div>地域: {settings.prefecture}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 計算結果 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4 text-gray-800">計算結果</h2>
              
              {result ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600 mb-1">報酬額</div>
                    <div className="text-2xl font-bold text-gray-800">
                      ¥{result.amount.toLocaleString()}
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    {result.withholdingAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">源泉徴収</span>
                        <span className="text-red-600 font-medium">
                          -¥{result.withholdingAmount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-medium text-gray-700">入金予定額</span>
                      <span className="text-lg font-bold text-gray-800">
                        ¥{result.depositAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 詳細な税金内訳 */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="text-sm font-medium text-yellow-900 mb-2">
                      月割税金・保険料（推定）
                    </div>
                    <div className="space-y-1.5 text-xs text-yellow-800">
                      <div className="flex justify-between">
                        <span>所得税（復興税込）</span>
                        <span>¥{Math.floor(result.taxBreakdown.incomeTax / 12).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>住民税</span>
                        <span>¥{Math.floor(result.taxBreakdown.residentTax / 12).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>国民健康保険</span>
                        <span>¥{Math.floor(result.taxBreakdown.healthInsurance / 12).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>国民年金</span>
                        <span>¥{Math.floor(result.taxBreakdown.pension / 12).toLocaleString()}</span>
                      </div>
                      {result.taxBreakdown.businessTax > 0 && (
                        <div className="flex justify-between">
                          <span>個人事業税</span>
                          <span>¥{Math.floor(result.taxBreakdown.businessTax / 12).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1.5 border-t border-yellow-300 font-medium">
                        <span>合計</span>
                        <span>¥{Math.floor(result.taxBreakdown.total / 12).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm text-green-800 mb-1">実質手取り（推定）</div>
                    <div className="text-3xl font-bold text-green-600">
                      ¥{Math.floor(result.estimatedTakeHome).toLocaleString()}
                    </div>
                    <div className="text-xs text-green-700 mt-1">
                      手取り率: {((result.estimatedTakeHome / result.amount) * 100).toFixed(1)}%
                    </div>
                  </div>

                  {/* 円グラフ */}
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => `¥${Math.floor(value).toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">
                  <Calculator size={48} className="mx-auto mb-2 opacity-50" />
                  <p>報酬額を入力して計算してください</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ダッシュボード */}
        {currentView === 'dashboard' && (
          <div className="space-y-6">
            {/* サマリーカード */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">今年の総収入</div>
                <div className="text-2xl font-bold text-gray-800">
                  ¥{yearlySummary.totalIncome.toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">入金予定額</div>
                <div className="text-2xl font-bold text-blue-600">
                  ¥{yearlySummary.totalDeposit.toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">実質手取り（推定）</div>
                <div className="text-2xl font-bold text-green-600">
                  ¥{Math.floor(yearlySummary.totalTakeHome).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  手取り率 {yearlySummary.totalIncome > 0 
                    ? ((yearlySummary.totalTakeHome / yearlySummary.totalIncome) * 100).toFixed(1) 
                    : 0}%
                </div>
              </div>
            </div>

            {/* グラフ */}
            {monthlyData.length > 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold mb-4 text-gray-800">月次推移</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => `¥${value.toLocaleString()}`} />
                      <Line 
                        type="monotone" 
                        dataKey="income" 
                        stroke="#6366f1" 
                        strokeWidth={2}
                        name="収入"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="takeHome" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        name="手取り"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-12 text-center text-gray-400">
                <TrendingUp size={48} className="mx-auto mb-2 opacity-50" />
                <p>データがありません。計算を実行してください。</p>
              </div>
            )}
          </div>
        )}

        {/* 履歴 */}
        {currentView === 'history' && (
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">計算履歴</h2>
              <p className="text-sm text-gray-600 mt-1">
                {calculations.length}件の計算記録
              </p>
            </div>
            
            {calculations.length > 0 ? (
              <div className="divide-y">
                {[...calculations].reverse().map((calc) => (
                  <div key={calc.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          {calc.projectName}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {new Date(calc.date).toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span className="text-gray-600">
                            報酬: ¥{calc.amount.toLocaleString()}
                          </span>
                          <span className="text-blue-600">
                            入金: ¥{calc.depositAmount.toLocaleString()}
                          </span>
                          <span className="text-green-600 font-medium">
                            手取り: ¥{Math.floor(calc.estimatedTakeHome).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(calc.id)}
                        className="text-red-500 hover:text-red-700 p-2"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-gray-400">
                <History size={48} className="mx-auto mb-2 opacity-50" />
                <p>履歴がありません</p>
              </div>
            )}
          </div>
        )}

        {/* 設定画面 */}
        {currentView === 'settings' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-6 text-gray-800">税金計算の設定</h2>
              
              <div className="space-y-6">
                {/* 申告方法 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    確定申告の方法
                  </label>
                  <select
                    value={settings.blueReturnType}
                    onChange={(e) => saveSettings({ ...settings, blueReturnType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="65">青色申告（65万円控除・e-Tax）</option>
                    <option value="55">青色申告（55万円控除・帳簿）</option>
                    <option value="10">青色申告（10万円控除）</option>
                    <option value="white">白色申告</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    <Info size={12} className="inline mr-1" />
                    青色申告は事前に税務署への届出が必要です
                  </p>
                </div>

                {/* 経費率 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    経費率: {settings.expenseRate}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="5"
                    value={settings.expenseRate}
                    onChange={(e) => saveSettings({ ...settings, expenseRate: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>80%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    売上に占める経費の割合（家賃・通信費・交通費など）
                  </p>
                </div>

                {/* 都道府県 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    お住まいの都道府県
                  </label>
                  <select
                    value={settings.prefecture}
                    onChange={(e) => saveSettings({ ...settings, prefecture: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.keys(HEALTH_INSURANCE_RATES).map(pref => (
                      <option key={pref} value={pref}>{pref}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    国民健康保険料は地域によって異なります
                  </p>
                </div>

                {/* 事業種類 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    事業の種類
                  </label>
                  <select
                    value={settings.businessType}
                    onChange={(e) => saveSettings({ ...settings, businessType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  >
                    {BUSINESS_TAX_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                    <option value="非課税">個人事業税非課税（文筆業など）</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    一部の業種は個人事業税（5%）が課税されます（事業所得290万円超）
                  </p>
                </div>

                {/* 配偶者控除 */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.spouseDeduction}
                      onChange={(e) => saveSettings({ ...settings, spouseDeduction: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      配偶者控除を適用（38万円）
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    配偶者の年収が103万円以下の場合
                  </p>
                </div>

                {/* 扶養控除 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    扶養家族の人数
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={settings.dependents}
                    onChange={(e) => saveSettings({ ...settings, dependents: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    1人あたり38万円控除（16歳以上の扶養親族）
                  </p>
                </div>

                {/* 保存ボタン */}
                <div className="pt-4 border-t">
                  <button
                    onClick={() => {
                      alert('設定を保存しました！');
                      setCurrentView('calculator');
                    }}
                    className="w-full bg-indigo-600 text-white py-3 rounded-md font-medium hover:bg-indigo-700 flex items-center justify-center gap-2"
                  >
                    <Save size={20} />
                    設定を保存して計算画面へ
                  </button>
                </div>

                {/* 注意事項 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-900 mb-2">
                    ℹ️ ご注意
                  </div>
                  <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                    <li>計算結果は概算です。実際の税額は確定申告で確定します</li>
                    <li>国民健康保険料は市区町村により異なる場合があります</li>
                    <li>所得控除（医療費控除・iDeCoなど）は含まれていません</li>
                    <li>詳細は税理士または税務署にご確認ください</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-gray-600">
          <p>フリカル - フリーランスのための正確な手取り計算アプリ</p>
          <p className="mt-1 text-xs text-gray-500">
            ※ 計算結果は概算です。正確な税額は確定申告で確定します。
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;