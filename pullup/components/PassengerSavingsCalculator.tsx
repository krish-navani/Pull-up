import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Animated, Easing, KeyboardAvoidingView,
    LayoutChangeEvent, PanResponder, Platform, ScrollView, Share,
    StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Palette (mirrors CarOwnerCalculator) ──────────────────────────
const A = '#22C55E'; const G = '#10B981'; const R = '#EF4444';
const BG = '#0A0A0A'; const CARD = '#141414'; const CARD2 = '#1C1C1C';
const B = '#252525'; const M = '#6B7280'; const S = '#A1A1AA'; const W = '#FFFFFF';
const TRACK_BG = '#2A2A2A';

// ── Savings logic ─────────────────────────────────────────────────
interface SavingsInputs {
    carpoolFare: number;        // ₹ per seat per one-way trip
    altCostPerDay: number;      // ₹ per day (cab / auto / own vehicle cost)
    daysPerMonth: number;       // 1–31
    monthsPerYear: number;      // 1–12
}

interface SavingsResults {
    carpoolDailyCost: number;
    altDailyCost: number;
    dailySavings: number;
    monthlySavings: number;
    yearlySavings: number;
    savingsPct: number;
    carpoolMonthly: number;
    altMonthly: number;
    carpoolYearly: number;
    altYearly: number;
    co2SavedKgYear: number;   // rough estimate: each car NOT driven
}

function calculateSavings(inp: SavingsInputs): SavingsResults {
    const carpoolDailyCost = inp.carpoolFare * 2;          // round-trip
    const altDailyCost     = inp.altCostPerDay;
    const dailySavings     = altDailyCost - carpoolDailyCost;
    const monthlySavings   = dailySavings     * inp.daysPerMonth;
    const yearlySavings    = monthlySavings   * inp.monthsPerYear;
    const carpoolMonthly   = carpoolDailyCost * inp.daysPerMonth;
    const altMonthly       = altDailyCost     * inp.daysPerMonth;
    const carpoolYearly    = carpoolMonthly   * inp.monthsPerYear;
    const altYearly        = altMonthly       * inp.monthsPerYear;
    const savingsPct       = altYearly > 0 ? (yearlySavings / altYearly) * 100 : 0;
    // CO2: rough — avg cab emits ~0.12 kg CO2/km, assume 20 km round-trip avoided per day
    const co2SavedKgYear   = Math.max(0, inp.daysPerMonth * inp.monthsPerYear * 20 * 0.12 * (dailySavings > 0 ? 1 : 0));
    return {
        carpoolDailyCost, altDailyCost, dailySavings,
        monthlySavings, yearlySavings, savingsPct,
        carpoolMonthly, altMonthly, carpoolYearly, altYearly,
        co2SavedKgYear,
    };
}

// ── Count-up hook ─────────────────────────────────────────────────
function useCountUp(target: number, duration = 800) {
    const anim = useRef(new Animated.Value(0)).current;
    const [val, setVal] = useState(0);
    useEffect(() => {
        anim.setValue(0);
        const id = anim.addListener(({ value }) => setVal(Math.round(value)));
        Animated.timing(anim, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        return () => anim.removeListener(id);
    }, [target]);
    return val;
}

// ── FadeIn wrapper ────────────────────────────────────────────────
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    const op = useRef(new Animated.Value(0)).current;
    const ty = useRef(new Animated.Value(14)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(op, { toValue: 1, duration: 420, delay, useNativeDriver: true }),
            Animated.timing(ty, { toValue: 0, duration: 360, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
    }, []);
    return <Animated.View style={{ opacity: op, transform: [{ translateY: ty }] }}>{children}</Animated.View>;
}

// ── Press button ──────────────────────────────────────────────────
function PressBtn({ style, onPress, children, disabled }: any) {
    const scale = useRef(new Animated.Value(1)).current;
    const press = () => Animated.sequence([
        Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    return (
        <TouchableOpacity onPress={() => { press(); onPress?.(); }} disabled={disabled} activeOpacity={1}>
            <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
        </TouchableOpacity>
    );
}

// ── Text field ────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, unit, onClear, note, kb = 'decimal-pad' }: {
    label: string; value: string; onChange: (t: string) => void;
    placeholder?: string; unit?: string; onClear?: () => void; note?: string; kb?: any;
}) {
    const focused = useRef(new Animated.Value(0)).current;
    const bc = focused.interpolate({ inputRange: [0, 1], outputRange: [B, A] });
    return (
        <Animated.View style={[st.field, { borderColor: bc }]}>
            <View style={st.fieldTop}>
                <Text style={st.flbl}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {note && <Text style={st.fNote}>{note}</Text>}
                    {unit && <Text style={st.funit}>{unit}</Text>}
                </View>
            </View>
            <View style={st.frow}>
                <TextInput style={st.finput} value={value} onChangeText={onChange}
                    placeholder={placeholder ?? '0'} placeholderTextColor="#333"
                    keyboardType={kb} selectionColor={A}
                    onFocus={() => Animated.timing(focused, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
                    onBlur={() => Animated.timing(focused, { toValue: 0, duration: 200, useNativeDriver: false }).start()} />
                {onClear && value.length > 0 && (
                    <TouchableOpacity onPress={onClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <View style={st.clearBtn}>
                            <MaterialCommunityIcons name="close" size={12} color={M} />
                        </View>
                    </TouchableOpacity>
                )}
            </View>
        </Animated.View>
    );
}

// ── Slider field ──────────────────────────────────────────────────
function SliderField({ label, value, min, max, step, unit, onChange }: {
    label: string; value: number; min: number; max: number;
    step: number; unit: string; onChange: (v: number) => void;
}) {
    const trackWidth = useRef(0);
    const pillScale  = useRef(new Animated.Value(1)).current;
    const thumbScale = useRef(new Animated.Value(1)).current;
    const pct = (value - min) / (max - min);

    const snapValue = (raw: number) => {
        const clamped = Math.max(min, Math.min(max, raw));
        return Math.round((clamped - min) / step) * step + min;
    };
    const valueFromX = (x: number) => {
        const w = trackWidth.current;
        if (w <= 0) return value;
        return snapValue(min + Math.max(0, Math.min(1, x / w)) * (max - min));
    };
    const onDragStart = () => {
        Animated.parallel([
            Animated.spring(thumbScale, { toValue: 1.25, useNativeDriver: true, speed: 30, bounciness: 8 }),
            Animated.spring(pillScale,  { toValue: 1.08, useNativeDriver: true, speed: 30, bounciness: 6 }),
        ]).start();
    };
    const onDragEnd = () => {
        Animated.parallel([
            Animated.spring(thumbScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }),
            Animated.spring(pillScale,  { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }),
        ]).start();
    };
    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder:  () => true,
        onPanResponderGrant:    (e) => { onDragStart(); onChange(valueFromX(e.nativeEvent.locationX)); },
        onPanResponderMove:     (e) => { onChange(valueFromX(e.nativeEvent.locationX)); },
        onPanResponderRelease:  () => onDragEnd(),
        onPanResponderTerminate:() => onDragEnd(),
    })).current;

    const displayVal = step < 1 ? value.toFixed(1) : Math.round(value).toString();
    const thumbLeft  = `${pct * 100}%` as `${number}%`;

    return (
        <View style={st.sliderWrap}>
            <View style={st.sliderTop}>
                <Text style={st.flbl}>{label}</Text>
                <Animated.View style={[st.pill, { transform: [{ scale: pillScale }] }]}>
                    <Text style={st.pillVal}>{displayVal}</Text>
                    <Text style={st.pillUnit}> {unit}</Text>
                </Animated.View>
            </View>
            <View
                style={st.trackHitArea}
                onLayout={(e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; }}
                {...panResponder.panHandlers}
            >
                <View style={st.trackBg}>
                    <View style={[st.trackFill, { width: `${pct * 100}%` }]} />
                </View>
                <Animated.View
                    pointerEvents="none"
                    style={[st.thumb, { left: thumbLeft, transform: [{ translateX: -10 }, { scale: thumbScale }] }]}
                />
            </View>
            <View style={st.sliderRange}>
                <Text style={st.rangeTxt}>{min} {unit}</Text>
                <Text style={st.rangeTxt}>{max} {unit}</Text>
            </View>
        </View>
    );
}

// ── Alt mode selector ─────────────────────────────────────────────
type AltMode = 'cab' | 'auto' | 'vehicle';
const ALT_MODES: { key: AltMode; icon: string; label: string }[] = [
    { key: 'cab',     icon: 'taxi',              label: 'Cab'     },
    { key: 'auto',    icon: 'rickshaw',          label: 'Auto'    },
    { key: 'vehicle', icon: 'car-side',          label: 'Own Car' },
];

function AltModePicker({ value, onChange }: { value: AltMode; onChange: (m: AltMode) => void }) {
    return (
        <View style={st.modeRow}>
            {ALT_MODES.map(({ key, icon, label }) => {
                const on = key === value;
                return (
                    <TouchableOpacity key={key} onPress={() => onChange(key)} activeOpacity={0.75}
                        style={[st.modePill, on && st.modeOn]}>
                        <MaterialCommunityIcons name={icon as any} size={18} color={on ? A : M} />
                        <Text style={[st.modeTxt, on && st.modeTxtOn]}>{label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const Div = () => <View style={st.div} />;

// ═══════════════════════════ MAIN ════════════════════════════════
export default function PassengerSavingsCalculator() {
    const router = useRouter();
    const [step, setStep] = useState<'input' | 'results'>('input');
    const [loading, setLoading] = useState(false);

    // Inputs
    const [carpoolFare, setCarpoolFare] = useState('80');   // ₹ per seat one-way
    const [altMode, setAltMode]         = useState<AltMode>('cab');
    const [altCost, setAltCost]         = useState('200');  // ₹ per day
    const [days, setDays]               = useState(22);
    const [months, setMonths]           = useState(12);

    const [results, setResults] = useState<SavingsResults | null>(null);

    const fare  = parseFloat(carpoolFare) || 0;
    const alt   = parseFloat(altCost)     || 0;
    const dailySavingPreview = fare > 0 && alt > 0 ? Math.round(alt - fare * 2) : null;

    const altLabel = altMode === 'cab' ? 'Cab/day' : altMode === 'auto' ? 'Auto/day' : 'Own car/day';

    const calc = useCallback(async () => {
        try {
            setLoading(true);
            if (fare <= 0) throw new Error('Enter a valid carpool fare');
            if (alt  <= 0) throw new Error('Enter a valid alternative cost');
            const inp: SavingsInputs = { carpoolFare: fare, altCostPerDay: alt, daysPerMonth: Math.round(days), monthsPerYear: Math.round(months) };
            setResults(calculateSavings(inp));
            setStep('results');
        } catch (e: any) { Alert.alert('Check inputs', e.message); }
        finally { setLoading(false); }
    }, [fare, alt, days, months]);

    const reset = useCallback(() => {
        setStep('input'); setResults(null);
        setCarpoolFare('80'); setAltCost('200'); setDays(22); setMonths(12);
    }, []);

    const share = useCallback(async () => {
        if (!results) return;
        await Share.share({
            message: `🚗 PullUp Carpool Savings\n\nI save ₹${Math.round(results.monthlySavings).toLocaleString('en-IN')} every month by carpooling instead of ${altMode}!\nYearly: ₹${Math.round(results.yearlySavings).toLocaleString('en-IN')}\n\nJoin PullUp & start saving!`,
        });
    }, [results, altMode]);

    if (step === 'results' && results) {
        return <Results results={results} altMode={altMode} onBack={reset} onShare={share} />;
    }

    return (
        <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>
            <View style={st.hdr}>
                <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={20} color={W} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={st.hTitle}>Savings Calculator</Text>
                    <Text style={st.hSub}>See how much you save carpooling</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

                    {/* Section 1 — Carpool fare */}
                    <FadeIn delay={40}>
                        <View style={st.card}>
                            <View style={st.sectionLabel}>
                                <MaterialCommunityIcons name="account-group" size={13} color={A} />
                                <Text style={st.sectionLabelTxt}>CARPOOL DETAILS</Text>
                            </View>
                            <Field
                                label="Fare per seat (one-way)"
                                value={carpoolFare}
                                onChange={setCarpoolFare}
                                placeholder="80"
                                unit="₹"
                                note="per seat"
                                onClear={() => setCarpoolFare('')}
                            />
                            <Div />
                            <SliderField label="Days you commute per month" value={days} min={1} max={31} step={1} unit="days" onChange={setDays} />
                            <Div />
                            <SliderField label="Months per year" value={months} min={1} max={12} step={1} unit="months" onChange={setMonths} />
                        </View>
                    </FadeIn>

                    {/* Section 2 — Alternative */}
                    <FadeIn delay={90}>
                        <View style={st.card}>
                            <View style={st.sectionLabel}>
                                <MaterialCommunityIcons name="swap-horizontal" size={13} color={S} />
                                <Text style={st.sectionLabelTxt}>YOUR ALTERNATIVE</Text>
                            </View>
                            <View style={st.altModeWrap}>
                                <Text style={[st.flbl, { marginBottom: 10 }]}>What would you use instead?</Text>
                                <AltModePicker value={altMode} onChange={setAltMode} />
                            </View>
                            <Div />
                            <Field
                                label={`${altLabel} (round-trip total)`}
                                value={altCost}
                                onChange={setAltCost}
                                placeholder={altMode === 'cab' ? '200' : altMode === 'auto' ? '120' : '150'}
                                unit="₹/day"
                                onClear={() => setAltCost('')}
                            />
                        </View>
                    </FadeIn>

                    {/* Bottom — preview + CTA */}
                    <FadeIn delay={140}>
                        <View style={st.bottomBlock}>
                            {dailySavingPreview !== null && (
                                <View style={[st.previewCard, { borderColor: (dailySavingPreview >= 0 ? A : R) + '35' }]}>
                                    <View>
                                        <Text style={st.previewLbl}>Estimated savings / day</Text>
                                        <Text style={{ fontSize: 11, color: M, marginTop: 2 }}>Carpooling vs {altMode}</Text>
                                    </View>
                                    <Text style={[st.previewVal, { color: dailySavingPreview >= 0 ? A : R }]}>
                                        {dailySavingPreview >= 0 ? '' : '–'}₹{Math.abs(dailySavingPreview)}
                                    </Text>
                                </View>
                            )}
                            <PressBtn style={[st.cta, loading && { opacity: 0.5 }]} onPress={calc} disabled={loading}>
                                {loading
                                    ? <ActivityIndicator color={W} />
                                    : <>
                                        <MaterialCommunityIcons name="lightning-bolt" size={18} color={W} style={{ marginRight: 8 }} />
                                        <Text style={st.ctaTxt}>Calculate My Savings</Text>
                                        <MaterialCommunityIcons name="chevron-right" size={18} color={W + 'BB'} style={{ marginLeft: 6 }} />
                                    </>}
                            </PressBtn>
                        </View>
                    </FadeIn>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ═══════════════════════════ RESULTS ════════════════════════════
function Results({ results, altMode, onBack, onShare }: {
    results: SavingsResults; altMode: AltMode;
    onBack: () => void; onShare: () => void;
}) {
    const saving = results.dailySavings > 0;
    const sc     = saving ? G : R;

    const monthly = useCountUp(Math.abs(Math.round(results.monthlySavings)));
    const yearly  = useCountUp(Math.abs(Math.round(results.yearlySavings)));
    const poolDay = useCountUp(Math.round(results.carpoolDailyCost));
    const altDay  = useCountUp(Math.round(results.altDailyCost));

    const altLabel = altMode === 'cab' ? 'Cab' : altMode === 'auto' ? 'Auto' : 'Own Car';
    const altIcon  = altMode === 'cab' ? 'taxi' : altMode === 'auto' ? 'rickshaw' : 'car-side';

    return (
        <SafeAreaView style={st.safe} edges={['top', 'left', 'right']}>
            <View style={st.hdr}>
                <TouchableOpacity onPress={onBack} style={st.iconBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={20} color={W} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={st.hTitle}>Your Savings</Text>
                    <Text style={st.hSub}>Carpool vs {altLabel}</Text>
                </View>
                <TouchableOpacity onPress={onShare} style={st.iconBtn}>
                    <MaterialCommunityIcons name="share-variant-outline" size={20} color={W} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>

                {/* Hero card */}
                <FadeIn delay={0}>
                    <View style={[st.heroCard, { borderColor: sc + '30' }]}>
                        <View style={[st.heroTopBadge, { backgroundColor: sc + '18', borderColor: sc + '35' }]}>
                            <MaterialCommunityIcons name={saving ? 'trending-down' : 'trending-up'} size={11} color={sc} />
                            <Text style={[st.heroTopBadgeTxt, { color: sc }]}>
                                {saving
                                    ? `${Math.abs(results.savingsPct).toFixed(0)}% cheaper than ${altLabel}`
                                    : `${altLabel} is cheaper — try a lower-fare ride`}
                            </Text>
                        </View>
                        <Text style={st.heroEye}>MONTHLY SAVINGS</Text>
                        <Text style={[st.heroAmt, { color: sc }]}>
                            {saving ? '' : '–'}₹{monthly.toLocaleString('en-IN')}
                        </Text>
                        <View style={st.heroFooter}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={13} color={M} />
                            <Text style={st.heroYearly}>
                                <Text style={{ color: sc, fontWeight: '700' }}>₹{yearly.toLocaleString('en-IN')}</Text>
                                <Text style={{ color: M, fontWeight: '500' }}> / year</Text>
                            </Text>
                        </View>
                    </View>
                </FadeIn>

                {/* Comparison cards */}
                <FadeIn delay={80}>
                    <View style={st.compareRow}>
                        <View style={[st.cmpCard, { borderColor: R + '35', backgroundColor: R + '08' }]}>
                            <View style={[st.cmpIconBox, { backgroundColor: R + '20', marginBottom: 10 }]}>
                                <MaterialCommunityIcons name={altIcon as any} size={15} color="#F87171" />
                            </View>
                            <Text style={st.cmpEye}>{altLabel.toUpperCase()} / DAY</Text>
                            <Text style={[st.cmpAmt, { color: '#F87171' }]}>₹{altDay}</Text>
                            <Text style={st.cmpSub}>Without carpool</Text>
                        </View>
                        <View style={st.cmpDivider}>
                            <View style={st.cmpDividerLine} />
                            <View style={st.cmpVs}><Text style={st.cmpVsTxt}>VS</Text></View>
                            <View style={st.cmpDividerLine} />
                        </View>
                        <View style={[st.cmpCard, { borderColor: G + '35', backgroundColor: G + '08' }]}>
                            <View style={[st.cmpIconBox, { backgroundColor: G + '20', marginBottom: 10 }]}>
                                <MaterialCommunityIcons name="account-group" size={15} color="#4ADE80" />
                            </View>
                            <Text style={st.cmpEye}>CARPOOL / DAY</Text>
                            <Text style={[st.cmpAmt, { color: '#4ADE80' }]}>₹{poolDay}</Text>
                            <Text style={st.cmpSub}>With PullUp</Text>
                        </View>
                    </View>
                </FadeIn>

                {/* Breakdown rows */}
                <FadeIn delay={150}>
                    <View style={st.card}>
                        <RRow label="Daily savings"   val={`₹${Math.round(results.dailySavings)}`}   c={sc} />
                        <Div />
                        <RRow label="Monthly savings" val={`₹${Math.round(results.monthlySavings).toLocaleString('en-IN')}`} c={sc} />
                        <Div />
                        <RRow label="Yearly savings"  val={`₹${Math.round(results.yearlySavings).toLocaleString('en-IN')}`}  c={sc} bold />
                    </View>
                </FadeIn>

                {/* Cost comparison */}
                <FadeIn delay={210}>
                    <View style={st.card}>
                        <RRow label="Your carpool cost / month" val={`₹${Math.round(results.carpoolMonthly).toLocaleString('en-IN')}`} c={A} bold />
                        <Div />
                        <RRow label={`${altLabel} would cost / month`} val={`₹${Math.round(results.altMonthly).toLocaleString('en-IN')}`} c={M} strike />
                    </View>
                </FadeIn>

                {/* Stats tiles */}
                <FadeIn delay={270}>
                    <View style={st.tiles}>
                        <View style={[st.tile, { borderColor: G + '22' }]}>
                            <Text style={[st.tileVal, { color: '#4ADE80' }]}>{(results.co2SavedKgYear / 1000).toFixed(1)}</Text>
                            <Text style={st.tileUnit}>tons CO₂/yr</Text>
                        </View>
                        <View style={[st.tile, { borderColor: B }]}>
                            <Text style={st.tileVal}>{Math.round(results.yearlySavings / 1000)}k</Text>
                            <Text style={st.tileUnit}>₹ saved/year</Text>
                        </View>
                        <View style={[st.tile, { borderColor: B }]}>
                            <Text style={[st.tileVal, { color: A }]}>{Math.abs(results.savingsPct).toFixed(0)}%</Text>
                            <Text style={st.tileUnit}>{saving ? 'cheaper' : 'more exp.'}</Text>
                        </View>
                    </View>
                </FadeIn>

                {/* Actions */}
                <FadeIn delay={320}>
                    <View style={st.actions}>
                        <PressBtn style={st.priBtn} onPress={onShare}>
                            <MaterialCommunityIcons name="share-variant-outline" size={16} color={W} style={{ marginRight: 8 }} />
                            <Text style={st.priTxt}>Share My Savings</Text>
                        </PressBtn>
                        <PressBtn style={st.secBtn} onPress={onBack}>
                            <MaterialCommunityIcons name="refresh" size={15} color={S} style={{ marginRight: 6 }} />
                            <Text style={st.secTxt}>Recalculate</Text>
                        </PressBtn>
                    </View>
                </FadeIn>
            </ScrollView>
        </SafeAreaView>
    );
}

function RRow({ label, val, c, bold, strike }: { label: string; val: string; c: string; bold?: boolean; strike?: boolean }) {
    return (
        <View style={st.rrow}>
            <Text style={st.rlbl}>{label}</Text>
            <Text style={[
                st.rval, { color: c },
                bold   && { fontWeight: '800', fontSize: 16 } as any,
                strike && { textDecorationLine: 'line-through', opacity: 0.45 } as any,
            ]}>{val}</Text>
        </View>
    );
}

// ── Styles (identical tokens to CarOwnerCalculator) ───────────────
const st = StyleSheet.create({
    safe:   { flex: 1, backgroundColor: BG },
    scroll: { padding: 16, paddingBottom: 44, gap: 10 },
    hdr:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
    hTitle: { fontSize: 15, fontWeight: '700', color: W },
    hSub:   { fontSize: 11, color: M, marginTop: 1 },
    iconBtn:{ width: 38, height: 38, borderRadius: 11, backgroundColor: CARD2, borderWidth: 1, borderColor: B, justifyContent: 'center', alignItems: 'center' },

    card:   { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: B, overflow: 'hidden' },
    div:    { height: 1, backgroundColor: B, marginHorizontal: 16 },

    sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
    sectionLabelTxt: { fontSize: 10, fontWeight: '700', color: S, letterSpacing: 1.4 },

    field:    { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderWidth: 0 },
    fieldTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
    flbl:     { fontSize: 11, fontWeight: '600', color: S, letterSpacing: 0.2 },
    funit:    { fontSize: 10, color: M, fontWeight: '600' },
    fNote:    { fontSize: 10, color: M, fontWeight: '500' },
    frow:     { flexDirection: 'row', alignItems: 'center' },
    finput:   { flex: 1, fontSize: 24, fontWeight: '700', color: W, paddingVertical: 0, letterSpacing: -0.5 },
    clearBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: B, borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignItems: 'center' },

    sliderWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
    sliderTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    trackHitArea: { height: 36, justifyContent: 'center', marginHorizontal: 2, position: 'relative' },
    trackBg:    { height: 4, backgroundColor: TRACK_BG, borderRadius: 4, overflow: 'visible' },
    trackFill:  { height: 4, backgroundColor: A, borderRadius: 4 },
    thumb:      { position: 'absolute', top: '50%', width: 16, height: 16, borderRadius: 8, backgroundColor: A, marginTop: -8 },
    pill:       { flexDirection: 'row', alignItems: 'baseline', backgroundColor: A + '18', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5, borderWidth: 1, borderColor: A + '45' },
    pillVal:    { fontSize: 13, fontWeight: '800', color: A, letterSpacing: -0.3 },
    pillUnit:   { fontSize: 10, color: A + 'AA', fontWeight: '600', marginLeft: 2 },
    sliderRange:{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginHorizontal: 2 },
    rangeTxt:   { fontSize: 10, color: M, fontWeight: '500', letterSpacing: 0.1 },

    altModeWrap: { padding: 16 },
    modeRow:    { flexDirection: 'row', gap: 8 },
    modePill:   { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: CARD2, borderWidth: 1, borderColor: B, alignItems: 'center', gap: 4 },
    modeOn:     { backgroundColor: A + '15', borderColor: A },
    modeTxt:    { fontSize: 11, fontWeight: '600', color: M },
    modeTxtOn:  { color: A },

    bottomBlock: { gap: 10 },
    previewCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 16 },
    previewLbl:  { fontSize: 13, fontWeight: '600', color: W },
    previewVal:  { fontSize: 28, fontWeight: '800', letterSpacing: -1 },

    cta:    { backgroundColor: A, borderRadius: 16, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: A, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
    ctaTxt: { fontSize: 16, fontWeight: '800', color: W, letterSpacing: 0.3 },

    heroCard:       { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center', gap: 4 },
    heroTopBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, marginBottom: 14 },
    heroTopBadgeTxt:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
    heroEye:        { fontSize: 10, fontWeight: '700', color: M, letterSpacing: 2.5, marginBottom: 2 },
    heroAmt:        { fontSize: 56, fontWeight: '800', letterSpacing: -3, marginBottom: 10 },
    heroFooter:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    heroYearly:     { fontSize: 15, letterSpacing: -0.3 },

    compareRow:     { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
    cmpCard:        { flex: 1, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'center' },
    cmpIconBox:     { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    cmpDivider:     { width: 24, alignItems: 'center', justifyContent: 'center', gap: 6 },
    cmpDividerLine: { flex: 1, width: 1, backgroundColor: '#2A2A2A' },
    cmpVs:          { width: 22, height: 22, borderRadius: 11, backgroundColor: B, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
    cmpVsTxt:       { fontSize: 7, fontWeight: '800', color: M, letterSpacing: 0.5 },
    cmpEye:         { fontSize: 9, fontWeight: '700', color: M, letterSpacing: 1.6, marginBottom: 4, marginTop: 2 },
    cmpAmt:         { fontSize: 30, fontWeight: '800', letterSpacing: -1.2 },
    cmpSub:         { fontSize: 10, color: M, marginTop: 3, fontWeight: '500' },

    rrow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
    rlbl: { fontSize: 13, color: S },
    rval: { fontSize: 15, fontWeight: '700' },

    tiles:   { flexDirection: 'row', gap: 8 },
    tile:    { flex: 1, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center' },
    tileVal: { fontSize: 18, fontWeight: '800', color: W, letterSpacing: -0.5 },
    tileUnit:{ fontSize: 9, fontWeight: '600', color: M, marginTop: 4, textAlign: 'center' },

    actions: { flexDirection: 'column', gap: 8 },
    secBtn:  { paddingVertical: 15, borderRadius: 14, alignItems: 'center', backgroundColor: CARD2, borderWidth: 1, borderColor: '#2E2E2E', flexDirection: 'row', justifyContent: 'center' },
    secTxt:  { fontSize: 14, fontWeight: '600', color: S },
    priBtn:  { paddingVertical: 17, borderRadius: 14, alignItems: 'center', backgroundColor: A, flexDirection: 'row', justifyContent: 'center', shadowColor: A, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
    priTxt:  { fontSize: 15, fontWeight: '800', color: W },
});
