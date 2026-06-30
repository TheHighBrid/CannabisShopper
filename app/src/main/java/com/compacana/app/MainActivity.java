package com.compacana.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.mail.Message;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;

public class MainActivity extends Activity {
    private static final String SOURCE_URL = "https://www.bulkbuddy.co/product-category/cannabis/craft-cannabis-flowers/";
    private static final String DEFAULT_EMAIL = "lapeuffe@gmail.com";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;
    private LinearLayout root;
    private TextView reportView;
    private ProgressBar progress;
    private Button runButton;
    private EditText smtpHost;
    private EditText smtpPort;
    private EditText smtpUser;
    private EditText smtpPass;
    private EditText emailFrom;
    private EditText emailTo;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("compa_cana_settings", MODE_PRIVATE);
        buildUi();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(17, 17, 17));

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(22), dp(18), dp(32));
        scroll.addView(root);

        TextView title = text("Compa Cana", 30, Color.rgb(156, 255, 106), true);
        root.addView(title);
        root.addView(text("Craft flower ranker · legal adult-use Canada research", 14, Color.rgb(210, 205, 196), false));
        root.addView(space(14));

        LinearLayout config = card();
        config.addView(text("Email settings", 20, Color.WHITE, true));
        config.addView(text("Use a Gmail App Password, not your normal password. The app emails the report automatically after it ranks craft flower.", 13, Color.rgb(190, 185, 176), false));
        smtpHost = edit("smtp_host", "SMTP host", "smtp.gmail.com", InputType.TYPE_CLASS_TEXT);
        smtpPort = edit("smtp_port", "SMTP port", "465", InputType.TYPE_CLASS_NUMBER);
        smtpUser = edit("smtp_user", "SMTP username", DEFAULT_EMAIL, InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        smtpPass = edit("smtp_pass", "SMTP app password", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        emailFrom = edit("email_from", "From email", DEFAULT_EMAIL, InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        emailTo = edit("email_to", "To email", DEFAULT_EMAIL, InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        config.addView(smtpHost);
        config.addView(smtpPort);
        config.addView(smtpUser);
        config.addView(smtpPass);
        config.addView(emailFrom);
        config.addView(emailTo);

        Button saveButton = button("Save Email Settings", Color.rgb(80, 80, 80));
        saveButton.setOnClickListener(v -> saveSettings());
        config.addView(saveButton);
        root.addView(config);
        root.addView(space(14));

        runButton = button("Run Craft Flower Report + Email", Color.rgb(61, 127, 69));
        runButton.setOnClickListener(v -> runReport());
        root.addView(runButton);

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        root.addView(progress);

        root.addView(space(14));
        reportView = text("Tap the button to rank craft flower only. Kief, hash, edibles, pre-rolls, vapes, and extracts are excluded.", 14, Color.rgb(245, 241, 232), false);
        reportView.setTextIsSelectable(true);
        reportView.setPadding(dp(14), dp(14), dp(14), dp(14));
        reportView.setBackground(cardBg(Color.rgb(27, 27, 27)));
        root.addView(reportView);

        setContentView(scroll);
    }

    private void saveSettings() {
        prefs.edit()
            .putString("smtp_host", smtpHost.getText().toString().trim())
            .putString("smtp_port", smtpPort.getText().toString().trim())
            .putString("smtp_user", smtpUser.getText().toString().trim())
            .putString("smtp_pass", smtpPass.getText().toString())
            .putString("email_from", emailFrom.getText().toString().trim())
            .putString("email_to", emailTo.getText().toString().trim())
            .apply();
        Toast.makeText(this, "Email settings saved", Toast.LENGTH_SHORT).show();
    }

    private void runReport() {
        saveSettings();
        runButton.setEnabled(false);
        progress.setVisibility(View.VISIBLE);
        reportView.setText("Fetching craft flower listings…");

        executor.execute(() -> {
            try {
                String html = fetchHtml(SOURCE_URL);
                List<Product> products = parseProducts(html);
                String report = buildReport(products);
                String emailStatus = sendEmailIfConfigured(report);
                runOnUiThread(() -> {
                    reportView.setText(report + "\n\n" + emailStatus);
                    progress.setVisibility(View.GONE);
                    runButton.setEnabled(true);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    reportView.setText("Error:\n" + e.getMessage());
                    progress.setVisibility(View.GONE);
                    runButton.setEnabled(true);
                });
            }
        });
    }

    private String fetchHtml(String urlText) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36");
        connection.setRequestProperty("Accept", "text/html,application/xhtml+xml");
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(30000);

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new Exception("Unable to fetch listings: HTTP " + status);
        }

        try (BufferedInputStream in = new BufferedInputStream(connection.getInputStream()); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString(StandardCharsets.UTF_8.name());
        } finally {
            connection.disconnect();
        }
    }

    private List<Product> parseProducts(String html) {
        Document doc = Jsoup.parse(html, SOURCE_URL);
        Elements cards = doc.select("div.product-wrapper, li.product, .type-product");
        List<Product> products = new ArrayList<>();

        for (Element card : cards) {
            Element link = card.selectFirst("h2.product-title a, a[href*=/product/]");
            if (link == null) continue;

            String name = clean(link.text());
            if (!isCraftFlowerName(name)) continue;

            Product p = new Product();
            p.name = name;
            p.url = link.absUrl("href");
            p.strain = extractStrain(card, name);
            p.rating = parseDouble(clean(textOf(card.selectFirst("strong.rating"))));
            p.reviews = parseFirstInt(textOf(card.selectFirst(".count-text")));
            p.startingPrice = parseLowestPrice(card.text());
            p.score = scoreProduct(p);
            products.add(p);
        }

        Collections.sort(products, (a, b) -> Double.compare(b.score, a.score));
        return products;
    }

    private String buildReport(List<Product> products) {
        StringBuilder out = new StringBuilder();
        String date = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.CANADA).format(new Date());

        out.append("COMPA CANA · CRAFT FLOWER RANKER\n");
        out.append("Generated: ").append(date).append("\n");
        out.append("Scope: craft cannabis flower only\n");
        out.append("Excluded: kief, hash, edibles, pre-rolls, vapes, extracts, CBD candy\n\n");

        if (products.isEmpty()) {
            out.append("No craft flower products were found. The website may have changed its HTML or blocked the request.\n");
            return out.toString();
        }

        out.append("TOP CRAFT FLOWER PICKS\n\n");
        int limit = Math.min(8, products.size());
        for (int i = 0; i < limit; i++) {
            Product p = products.get(i);
            String medal = i == 0 ? "🥇" : i == 1 ? "🥈" : i == 2 ? "🥉" : "•";
            out.append(medal).append(" #").append(i + 1).append(" ").append(p.name).append("\n");
            out.append("   Type: ").append(p.strain).append("\n");
            out.append("   Rating: ").append(p.rating > 0 ? p.rating + "/5" : "missing").append(" · ").append(p.reviews > 0 ? p.reviews + " reviews" : "reviews missing").append("\n");
            out.append("   Price signal: ").append(p.startingPrice > 0 ? "$" + money(p.startingPrice) + " starting" : "missing").append("\n");
            out.append("   Listing score: ").append(money(p.score)).append("/100\n");
            out.append("   Why it ranks: ").append(explain(p)).append("\n\n");
        }

        out.append("3 OZ VARIETY VS QUARTER POUND CHECK\n\n");
        out.append("Your rule:\n");
        out.append("  • Ignore sitewide discount banners.\n");
        out.append("  • 3 oz gives strain variety.\n");
        out.append("  • QP means one strain only.\n");
        out.append("  • Recommend a single-strain QP only if value is clearly better than 3 oz variety.\n\n");
        out.append("Current decision:\n");
        out.append("  Category cards show starting prices, not reliable 3 oz and QP variant prices.\n");
        out.append("  So this version does not force a QP recommendation from incomplete data.\n\n");
        out.append("Upgrade rule:\n");
        out.append("  Pick one QP only if its $/g is at least 12–15% cheaper than the best 3 oz variety basket after the 35% bulk discount.\n");
        out.append("  Otherwise, 3 oz variety wins because you get more strain diversity.\n\n");
        out.append("Research comparison only. Legal adult-use Canada context. No medical or safety claims.\n");

        return out.toString();
    }

    private String sendEmailIfConfigured(String report) {
        String host = value("smtp_host", "smtp.gmail.com");
        String port = value("smtp_port", "465");
        String user = value("smtp_user", DEFAULT_EMAIL);
        String pass = value("smtp_pass", "");
        String from = value("email_from", user);
        String to = value("email_to", DEFAULT_EMAIL);

        if (host.isEmpty() || port.isEmpty() || user.isEmpty() || pass.isEmpty() || from.isEmpty() || to.isEmpty()) {
            return "Email skipped: SMTP settings are incomplete. Add a Gmail App Password, not your normal password.";
        }

        try {
            Properties props = new Properties();
            props.put("mail.smtp.host", host);
            props.put("mail.smtp.port", port);
            props.put("mail.smtp.auth", "true");
            if ("465".equals(port)) {
                props.put("mail.smtp.ssl.enable", "true");
            } else {
                props.put("mail.smtp.starttls.enable", "true");
            }

            Session session = Session.getInstance(props, new javax.mail.Authenticator() {
                @Override
                protected PasswordAuthentication getPasswordAuthentication() {
                    return new PasswordAuthentication(user, pass);
                }
            });

            Message message = new MimeMessage(session);
            message.setFrom(new InternetAddress(from));
            message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to));
            message.setSubject("Compa Cana Craft Flower Report");
            message.setText(report);
            Transport.send(message);
            return "Email sent to " + to;
        } catch (Exception e) {
            return "Email failed: " + e.getMessage();
        }
    }

    private String value(String key, String fallback) {
        return prefs.getString(key, fallback).trim();
    }

    private boolean isCraftFlowerName(String name) {
        String lower = name.toLowerCase(Locale.CANADA);
        if (!lower.contains("craft")) return false;
        String[] blocked = {"kief", "hash", "pre-roll", "pre rolled", "joint", "gummy", "gummies", "edible", "extract", "vape", "cart", "cartridge", "shatter", "wax", "rosin", "distillate", "cbd"};
        for (String word : blocked) if (lower.contains(word)) return false;
        return true;
    }

    private String extractStrain(Element card, String name) {
        String strain = clean(textOf(card.selectFirst(".gs_strain")));
        if (!strain.isEmpty()) return strain;
        String lower = (name + " " + card.text()).toLowerCase(Locale.CANADA);
        if (lower.contains("indica")) return "Indica";
        if (lower.contains("sativa")) return "Sativa";
        if (lower.contains("hybrid")) return "Hybrid";
        return "Craft flower";
    }

    private double scoreProduct(Product p) {
        double ratingPart = p.rating > 0 ? (p.rating / 5.0) * 55.0 : 0.0;
        double reviewPart = p.reviews > 0 ? Math.min(25.0, (Math.log10(p.reviews + 1.0) / Math.log10(201.0)) * 25.0) : 0.0;
        double craftPart = 10.0;
        double pricePart = p.startingPrice <= 0 ? 0.0 : p.startingPrice <= 17 ? 10.0 : p.startingPrice <= 18 ? 8.0 : p.startingPrice <= 20 ? 5.0 : 2.0;
        return ratingPart + reviewPart + craftPart + pricePart;
    }

    private String explain(Product p) {
        List<String> notes = new ArrayList<>();
        if (p.rating >= 4.8) notes.add("strong rating");
        if (p.reviews >= 100) notes.add("high review volume");
        if (p.startingPrice > 0 && p.startingPrice <= 17) notes.add("better visible starting price");
        notes.add(p.strain + " craft flower");
        return join(notes, ", ") + ".";
    }

    private double parseLowestPrice(String text) {
        Matcher matcher = Pattern.compile("\\$\\s*([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)").matcher(text);
        double lowest = 0.0;
        while (matcher.find()) {
            double value = parseDouble(matcher.group(1).replace(",", ""));
            if (value > 0 && (lowest == 0.0 || value < lowest)) lowest = value;
        }
        return lowest;
    }

    private int parseFirstInt(String text) {
        Matcher matcher = Pattern.compile("[0-9]+").matcher(text == null ? "" : text);
        return matcher.find() ? Integer.parseInt(matcher.group()) : 0;
    }

    private double parseDouble(String text) {
        try {
            return Double.parseDouble(text == null ? "" : text.trim());
        } catch (Exception ignored) {
            return 0.0;
        }
    }

    private String textOf(Element element) {
        return element == null ? "" : element.text();
    }

    private String clean(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    private String money(double value) {
        return String.format(Locale.CANADA, "%.2f", value);
    }

    private String join(List<String> items, String separator) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(separator);
            sb.append(items.get(i));
        }
        return sb.toString();
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        card.setBackground(cardBg(Color.rgb(27, 27, 27)));
        return card;
    }

    private GradientDrawable cardBg(int color) {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), Color.rgb(55, 55, 55));
        return bg;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView tv = new TextView(this);
        tv.setText(value);
        tv.setTextSize(sp);
        tv.setTextColor(color);
        tv.setLineSpacing(0, 1.12f);
        if (bold) tv.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return tv;
    }

    private EditText edit(String key, String hint, String fallback, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setText(prefs.getString(key, fallback));
        e.setInputType(inputType);
        e.setSingleLine(true);
        e.setTextColor(Color.WHITE);
        e.setHintTextColor(Color.rgb(150, 150, 150));
        return e;
    }

    private Button button(String label, int color) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setBackground(cardBg(color));
        return b;
    }

    private View space(int dp) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(dp)));
        return v;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static class Product {
        String name;
        String url;
        String strain;
        double rating;
        int reviews;
        double startingPrice;
        double score;
    }
}
