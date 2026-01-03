using System.Collections.ObjectModel;
using Avalonia.Platform.Storage;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using UserSecretManager.Models;
using UserSecretManager.Services;

namespace UserSecretManager.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private readonly IProjectScanner _projectScanner;
    private readonly ISecretsService _secretsService;
    private Func<Task<IStorageFolder?>>? _folderPickerFunc;

    [ObservableProperty]
    private bool _isScanning;

    [ObservableProperty]
    private string? _currentDirectory;

    [ObservableProperty]
    private string? _statusMessage;

    [ObservableProperty]
    private ProjectTabViewModel? _selectedTab;

    [ObservableProperty]
    private string _searchText = string.Empty;

    public ObservableCollection<ProjectTabViewModel> Tabs { get; } = [];

    public MainWindowViewModel()
        : this(new ProjectScanner(), new SecretsService())
    {
    }

    public MainWindowViewModel(IProjectScanner projectScanner, ISecretsService secretsService)
    {
        _projectScanner = projectScanner;
        _secretsService = secretsService;
        StatusMessage = "Select a folder to scan for .NET projects with User Secrets";
    }

    public void SetFolderPicker(Func<Task<IStorageFolder?>> folderPickerFunc)
    {
        _folderPickerFunc = folderPickerFunc;
    }

    [RelayCommand]
    private async Task OpenFolderAsync()
    {
        if (_folderPickerFunc is null)
        {
            StatusMessage = "Folder picker not available";
            return;
        }

        var folder = await _folderPickerFunc();
        if (folder is null) return;

        await ScanDirectoryAsync(folder.Path.LocalPath);
    }

    [RelayCommand]
    private async Task ScanDirectoryAsync(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return;

        IsScanning = true;
        StatusMessage = $"Scanning {path}...";
        Tabs.Clear();

        try
        {
            var projects = await _projectScanner.ScanDirectoryAsync(path);
            CurrentDirectory = path;

            if (projects.Count == 0)
            {
                StatusMessage = "No projects with User Secrets found";
                return;
            }

            foreach (var project in projects)
            {
                var secrets = await _secretsService.LoadSecretsAsync(project);
                var tab = new ProjectTabViewModel(secrets, _secretsService);
                Tabs.Add(tab);
            }

            SelectedTab = Tabs.FirstOrDefault();
            StatusMessage = $"Found {projects.Count} project(s) with User Secrets";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error scanning: {ex.Message}";
        }
        finally
        {
            IsScanning = false;
        }
    }

    [RelayCommand]
    private async Task SaveCurrentAsync()
    {
        if (SelectedTab is null) return;

        try
        {
            await SelectedTab.SaveAsync();
            StatusMessage = $"Saved {SelectedTab.ProjectName}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error saving: {ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveAllAsync()
    {
        var dirtyTabs = Tabs.Where(t => t.IsDirty).ToList();
        if (dirtyTabs.Count == 0)
        {
            StatusMessage = "No changes to save";
            return;
        }

        try
        {
            foreach (var tab in dirtyTabs)
            {
                await tab.SaveAsync();
            }
            StatusMessage = $"Saved {dirtyTabs.Count} file(s)";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error saving: {ex.Message}";
        }
    }

    [RelayCommand]
    private void CloseTab(ProjectTabViewModel tab)
    {
        var index = Tabs.IndexOf(tab);
        Tabs.Remove(tab);
        
        if (SelectedTab == tab)
        {
            SelectedTab = Tabs.ElementAtOrDefault(Math.Max(0, index - 1));
        }
    }

    partial void OnSearchTextChanged(string value)
    {
        // Basic search implementation - highlight matching tabs
        foreach (var tab in Tabs)
        {
            tab.IsSearchMatch = string.IsNullOrWhiteSpace(value) ||
                                tab.Content.Contains(value, StringComparison.OrdinalIgnoreCase);
        }
    }
}
