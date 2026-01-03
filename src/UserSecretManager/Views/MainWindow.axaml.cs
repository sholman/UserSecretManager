using Avalonia;
using Avalonia.Controls;
using Avalonia.Data.Converters;
using Avalonia.Interactivity;
using Avalonia.Media;
using Avalonia.Platform.Storage;
using SukiUI.Controls;
using SukiUI.Dialogs;
using System.Globalization;
using UserSecretManager.ViewModels;

namespace UserSecretManager.Views;

public partial class MainWindow : SukiWindow
{
    public MainWindow()
    {
        InitializeComponent();
    }

    protected override void OnDataContextChanged(EventArgs e)
    {
        base.OnDataContextChanged(e);
        
        if (DataContext is MainWindowViewModel vm)
        {
            vm.SetFolderPicker(PickFolderAsync);
        }
    }

    private async Task<IStorageFolder?> PickFolderAsync()
    {
        var topLevel = GetTopLevel(this);
        if (topLevel is null) return null;

        var folders = await topLevel.StorageProvider.OpenFolderPickerAsync(new FolderPickerOpenOptions
        {
            Title = "Select folder to scan",
            AllowMultiple = false
        });

        return folders.FirstOrDefault();
    }

    private void OnExitClick(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    private void OnAboutClick(object? sender, RoutedEventArgs e)
    {
        // Simple about - we can enhance this later with SukiUI dialogs
        var dialog = new Window
        {
            Title = "About",
            Width = 400,
            Height = 300,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Content = new AboutDialog()
        };
        dialog.ShowDialog(this);
    }
}

/// <summary>
/// Converts a boolean (IsValidJson) to a background color for the validation indicator.
/// </summary>
public class BoolToValidationColorConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool isValid)
        {
            return isValid 
                ? new SolidColorBrush(Color.Parse("#22c55e")) // Green
                : new SolidColorBrush(Color.Parse("#ef4444")); // Red
        }
        return new SolidColorBrush(Colors.Gray);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

/// <summary>
/// Converts a boolean (IsValidJson) to a text label.
/// </summary>
public class BoolToValidationTextConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool isValid)
        {
            return isValid ? "✓ Valid JSON" : "✗ Invalid JSON";
        }
        return "Unknown";
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}