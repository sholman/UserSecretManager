using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using UserSecretManager.Models;
using UserSecretManager.Services;

namespace UserSecretManager.ViewModels;

/// <summary>
/// ViewModel for an appsettings file (read-only view).
/// </summary>
public partial class AppSettingsFileViewModel : ViewModelBase
{
    private readonly AppSettingsFile _appSettings;
    private readonly ISecretsService _secretsService;

    public string FileName => _appSettings.FileName;
    public string FilePath => _appSettings.FilePath;
    public string Content => _appSettings.Content;
    public bool IsValidJson => _appSettings.IsValidJson;

    public AppSettingsFileViewModel(AppSettingsFile appSettings, ISecretsService secretsService)
    {
        _appSettings = appSettings;
        _secretsService = secretsService;
    }

    [RelayCommand]
    private void FormatJson()
    {
        if (!IsValidJson) return;
        _appSettings.Content = _secretsService.FormatJson(_appSettings.Content);
        OnPropertyChanged(nameof(Content));
    }

    public override string ToString() => FileName;
}
