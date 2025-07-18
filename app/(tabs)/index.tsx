import { LinearGradient } from 'expo-linear-gradient';
import mqtt, { MqttClient } from 'mqtt';
import React, { useEffect, useState } from 'react';
import {
    Dimensions,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Svg, { Circle, Defs, Path, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';

const { width } = Dimensions.get('window');

// --- MQTT Configuration ---
const BROKER_URL = "wss://33a3ef54aaa447b88ce44eb6e4a366ac.s1.eu.hivemq.cloud:8884/mqtt";
const BROKER_USERNAME = "hivemq.webclient.1751300302417";
const BROKER_PASSWORD = "P<,pS?OoY&djBc682A0w";
const SENSOR_TOPIC_WATER = 'esp32/distance';
const SENSOR_TOPIC_AIR_TEMP = 'esp32/air_temperature';
const SENSOR_TOPIC_AIR_HUMIDITY = 'esp32/air_humidity';
const SENSOR_TOPIC_WATER_TEMP = 'esp32/water_temperature';
const SENSOR_TOPIC_PUMP_STATUS = 'esp32/pump_status';
const CLIENT_ID = `react-native-monitor-${Math.random().toString(16).substr(2, 8)}`;


/**
 * A custom, true semi-circle progress bar component built with react-native-svg.
 * This fixes the layout and visual issues from previous versions.
 */
const SemiCircleProgress = ({ progress, size = 120, strokeWidth = 12, colors, children }) => {
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = Math.PI * radius; // Circumference of a semi-circle

    // Function to describe the arc path
    const describeArc = (x, y, radius, startAngle, endAngle) => {
        const start = {
            x: x + radius * Math.cos(startAngle),
            y: y + radius * Math.sin(startAngle)
        };
        const end = {
            x: x + radius * Math.cos(endAngle),
            y: y + radius * Math.sin(endAngle)
        };
        const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
        const d = [
            "M", start.x, start.y,
            "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
        ].join(" ");
        return d;
    }

    // Angles for a top semi-circle (from -180 to 0 degrees in radians)
    const startAngleRad = Math.PI; // 180 degrees
    const endAngleRad = 2 * Math.PI; // 360 or 0 degrees

    const progressAngleRad = startAngleRad + (progress / 100) * (endAngleRad - startAngleRad);

    const backgroundPath = describeArc(center, center, radius, startAngleRad, endAngleRad);
    const progressPath = describeArc(center, center, radius, startAngleRad, progressAngleRad);

    // Calculate thumb position within the SVG
    const thumbX = center + radius * Math.cos(progressAngleRad);
    const thumbY = center + radius * Math.sin(progressAngleRad);

    return (
        <View style={{ width: size, height: size / 2 + strokeWidth, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <SvgLinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        {colors.map((color, index) => (
                            <Stop key={index} offset={`${(index / (colors.length - 1)) * 100}%`} stopColor={color} />
                        ))}
                    </SvgLinearGradient>
                </Defs>

                {/* Background Track */}
                <Path
                    d={backgroundPath}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.2)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />

                {/* Progress Path */}
                {progress > 0 && (
                    <Path
                        d={progressPath}
                        fill="none"
                        stroke="url(#grad)"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                )}

                {/* Thumb Indicator */}
                {progress > 0 && (
                    <Circle
                        cx={thumbX}
                        cy={thumbY}
                        r={strokeWidth / 2}
                        fill="#FFFFFF"
                    />
                )}
            </Svg>
            <View style={styles.centerValueContainer}>
                {children}
            </View>
        </View>
    );
};

export default function PlantMonitorScreen() {
    // --- Component State ---
    // FIX: Provided correct variable names for each useState hook.
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [airTemp, setAirTemp] = useState(0);
    const [airHumidity, setAirHumidity] = useState(0);
    const [waterTemp, setWaterTemp] = useState(0);
    const [pumpStatus, setPumpStatus] = useState('OFF');
    const [waterLevel, setWaterLevel] = useState(0);

    // --- MQTT Connection Effect ---
    useEffect(() => {
        let client: MqttClient | null = null;
        try {
            setConnectionStatus('Connecting...');
            const options = { clientId: CLIENT_ID, username: BROKER_USERNAME, password: BROKER_PASSWORD };
            client = mqtt.connect(BROKER_URL, options);

            client.on('connect', () => {
                setConnectionStatus('Connected');
                const topics = [SENSOR_TOPIC_WATER, SENSOR_TOPIC_AIR_TEMP, SENSOR_TOPIC_AIR_HUMIDITY, SENSOR_TOPIC_WATER_TEMP, SENSOR_TOPIC_PUMP_STATUS];
                topics.forEach(topic => client?.subscribe(topic, (err) => err && console.error(`Subscription error:`, err)));
            });

            client.on('error', (err) => {
                console.error('Connection error:', err);
                setConnectionStatus(`Error`);
                client?.end();
            });

            client.on('close', () => setConnectionStatus('Disconnected'));
            client.on('offline', () => setConnectionStatus('Offline'));

            client.on('message', (receivedTopic, message) => {
                const value = message.toString();
                switch (receivedTopic) {
                    case SENSOR_TOPIC_WATER:
                        const tankHeight = 30;
                        const waterLevelPercent = Math.max(0, Math.min(100, ((tankHeight - parseFloat(value)) / tankHeight) * 100));
                        setWaterLevel(waterLevelPercent);
                        break;
                    case SENSOR_TOPIC_AIR_TEMP:
                        setAirTemp(parseFloat(value));
                        break;
                    case SENSOR_TOPIC_AIR_HUMIDITY:
                        setAirHumidity(parseFloat(value));
                        break;
                    case SENSOR_TOPIC_WATER_TEMP:
                        setWaterTemp(parseFloat(value));
                        break;
                    case SENSOR_TOPIC_PUMP_STATUS:
                        setPumpStatus(value.toUpperCase());
                        break;
                }
            });

        } catch (error) {
            console.error("MQTT Connection Failed:", error);
            setConnectionStatus('Failed');
        }
        return () => client?.end();
    }, []);

    // --- Component Render ---
    return (
        <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.container}
        >
            <SafeAreaView style={styles.safeArea}>
                <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

                <View style={styles.header}>
                    <Text style={styles.headerText}>Hydroponics Monitor</Text>
                    <Text style={[styles.status, { color: connectionStatus === 'Connected' ? '#69F0AE' : '#FF5252' }]}>
                        {connectionStatus}
                    </Text>
                </View>

                <View style={styles.cardsContainer}>
                    <View style={styles.row}>
                        <WaterLevelCard waterLevel={waterLevel} />
                        <TemperatureCard
                            title="Air Temperature"
                            temperature={airTemp}
                        />
                    </View>
                    <View style={styles.row}>
                        <HumidityCard humidity={airHumidity} />
                        <TemperatureCard
                            title="Water Temperature"
                            temperature={waterTemp}
                        />
                    </View>
                    <View style={styles.centeredRow}>
                        <PumpStatusCard status={pumpStatus} />
                    </View>
                </View>
            </SafeAreaView>
        </LinearGradient>
    );
}

// --- Prop Interfaces ---
interface WaterLevelCardProps { waterLevel: number; }
interface TemperatureCardProps { title: string; temperature: number; }
interface HumidityCardProps { humidity: number; }
interface PumpStatusCardProps { status: string; }

// --- Card Components ---

const WaterLevelCard = ({ waterLevel }: WaterLevelCardProps) => (
    <View style={styles.card}>
        <Text style={styles.cardTitle}>Water Level</Text>
        <SemiCircleProgress
            progress={waterLevel}
            colors={['#89f7fe', '#66a6ff']}
        >
            <Text style={styles.progressValue}>{waterLevel.toFixed(1)}%</Text>
        </SemiCircleProgress>
    </View>
);

const TemperatureCard = ({ title, temperature }: TemperatureCardProps) => {
    const maxTemp = 50;
    const progress = Math.min(100, Math.max(0, (temperature / maxTemp) * 100));
    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <SemiCircleProgress
                progress={progress}
                colors={['#4CAF50', '#9C27B0']} // Green to Purple gradient
            >
                <Text style={styles.progressValue}>{temperature.toFixed(1)}°C</Text>
            </SemiCircleProgress>
        </View>
    );
};

const HumidityCard = ({ humidity }: HumidityCardProps) => (
    <View style={styles.card}>
        <Text style={styles.cardTitle}>Air Humidity</Text>
        <SemiCircleProgress
            progress={humidity}
            colors={['#29B6F6', '#81D4FA']}
        >
            <Text style={styles.progressValue}>{humidity.toFixed(1)}%</Text>
        </SemiCircleProgress>
    </View>
);

const PumpStatusCard = ({ status }: PumpStatusCardProps) => (
    <View style={[styles.card, { width: (width - 48) / 2 }]}>
        <Text style={styles.cardTitle}>Pump Status</Text>
        <View style={styles.valueContainer}>
            <Text style={styles.mainValue}>{status}</Text>
            <View style={[styles.statusIndicator, { backgroundColor: status === 'ON' ? '#4CAF50' : '#F44336' }]} />
        </View>
    </View>
);

// --- Stylesheet ---
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 0,
    },
    header: {
        paddingVertical: 30,
        alignItems: 'center',
    },
    headerText: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    status: {
        fontSize: 16,
        fontWeight: '600',
        marginTop: 4,
    },
    cardsContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    centeredRow: {
        alignItems: 'center',
        marginBottom: 16,
    },
    card: {
        width: (width - 48) / 2,
        height: 180,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    valueContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainValue: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 12,
    },
    statusIndicator: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    // Styles for custom progress component
    centerValueContainer: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    progressValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
});
